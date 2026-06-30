# 09 — Boas práticas de comentários (Clean Code)

**Filosofia em uma frase:** Se o código "precisa de um comentário para explicar", isso é code smell — a explicação deve viver no próprio código (nomes reveladores, funções isoladas, intenção clara), não em prosa.

---

## A regra

Código de aplicação **não** leva comentário ou docstring que explique lógica (o quê, por quê, como). Essa é a base do livro *Clean Code* de Uncle Bob: comentário é um **sintoma de que o código não comunica a intenção**. A intenção deve estar no código — em nomes, estrutura, e abstrações — não escondida em texto narrativo que apodrece.

**Escopo:** JavaScript/TypeScript, Java, Go, C/C++, Python, Ruby, e linguagens de domínio semelhantes. **Não se aplica** a IaC/config (`.tf`, `.tfvars`, `.yaml`, `.yml`, `.toml`, `.sh`/shell).

---

## Por que essa regra existe

| Problema | Exemplos |
|----------|----------|
| **Comment rot** | Comentário fica desatualizado conforme o código muda. Após 10 commits, ninguém sabe qual versão dele é verdade. |
| **Duplicação de informação** | `// soma a e b\nreturn a + b` — o código já diz. A prosa é ruído. |
| **Code smell** | Se algo "precisa de explicação", é porque a abstração está errada. Solução: renomear / extrair função / isolar responsabilidade. |
| **Clutter** | Comentário de seção, banner, óbvio, narrativo — enche a bancada. Código com comentário é mais longo, mais difícil de escanear. |
| **Modelo tende a gerar comentário por default** | Na ausência de regra + enforcement, o LLM faz o que foi feito em bilhões de exemplos de treinamento: comenta. Precisa de bloqueio determinístico. |

**O conceito:** Se você se vê escrevendo um comentário, **pause**. Pergunte-se:

> "Como eu expresso isso *no código*?"

Exemplos:
- Comentário explica variável? Renomeia.
- Comentário explica bloco? Extrai função com nome de intenção.
- Comentário avisa de edge case? Levanta erro ou expressa no contrato de tipo (TypeScript), não em narrativa.

---

## Exemplos: bom × ruim

### ❌ Ruim: Comentário explicativo

```javascript
// verifica se o user pode acessar o recurso
if (user.role === 'admin' || (user.permissions & PERM_READ)) {
  grantAccess();
}
```

### ✅ Bom: Código autoexplicativo

```javascript
const canAccessResource = user.role === 'admin' || user.hasReadPermission();
if (canAccessResource) {
  grantAccess();
}
```

---

### ❌ Ruim: JSDoc narrativo

```typescript
/**
 * Busca um usuário pelo email. Primeiro tenta cache,
 * e se não achar, consulta o banco de dados.
 * Retorna null se o usuário não existir.
 */
async function getUserByEmail(email: string): Promise<User | null> {
  ...
}
```

### ✅ Bom: Tipo e nome revelam intenção; detalhes na implementação

```typescript
async function findUserByEmail(email: string): Promise<User | null> {
  return userCache.get(email) ?? userRepository.findByEmail(email)
}
```

Se você está tentando documentar o comportamento caching para um *consumidor* da API (não para o código-fonte), isso é **artefato externo** (README, OpenAPI, ADR) — não docstring inline. Delegue ao agente **glossia**.

---

### ❌ Ruim: Banner de seção

```javascript
// ========================================
// autenticacao
// ========================================

function login(email, password) { ... }
function logout() { ... }
function refresh() { ... }
```

### ✅ Bom: Arquivo/módulo separado com nome claro

```
auth/
  ├── login.ts
  ├── logout.ts
  └── refresh.ts
```

Ou, se no mesmo arquivo, estrutura a classe:

```typescript
class AuthService {
  login(email: string, password: string) { ... }
  logout() { ... }
  refresh() { ... }
}
```

---

### ❌ Ruim: Comentário óbvio

```python
# incrementa contador
counter += 1

# retorna o resultado
return result
```

### ✅ Bom: Sem comentário (é óbvio)

```python
counter += 1

return result
```

---

## O que é permitido

| Categoria | Exemplo | Por quê |
|-----------|---------|--------|
| **Licença** | `// Copyright 2026 Douglas...` / `// Licensed under MIT` | Metadados legais, não lógica |
| **Diretiva de tooling** | `// eslint-disable-next-line no-implicit-any` / `@ts-expect-error` / `# type: ignore` | Instruem ferramentas, não explicam código |
| **Marcador acionável** | `// TODO: PROJ-123` / `// FIXME: implementar rollback` / `// HACK` / `// WIP` | Marcam dívida/risk, e o ticket-link rastreável |
| **Referência de ticket** | `// See JIRA-456` / `# Fixes BUG-789` | Linkam decisão a origem |
| **Shebang** | `#!/usr/bin/env python` | Diretiva do OS, não comentário |

---

## A válvula de escape: `code-smell`

Em **último caso absoluto** — numa fronteira de abstração onde é genuinamente impossível tornar o código autoexplicativo — um comentário passa se e **somente se** contiver explicitamente a palavra `code-smell`.

**Exemplo (raro):**

```javascript
// code-smell: bitfield (bits 0-3 = role, 4-6 = level) — compacto mas ilegível; enum custa RAM no hot path. Reavaliar se o profile mudar.
const flags = (role << 4) | level;
```

> Cada linha de comentário é avaliada isoladamente pelo hook. Para uma nota de várias linhas, use um bloco `/* code-smell: ... */` (avaliado como um todo) ou repita o marcador em cada linha — senão as linhas sem `code-smell` são bloqueadas.

Isso **reconhece a dívida conscientemente** — e é deliberadamente chato de digitar para desincentivar. Não é solução; é aviso de que você aceitou a dívida, não está negando.

Se o código parece precisar de `code-smell`, questione:
1. Pode extrair a lógica em função/variável nomeada? → faça.
2. A abstração está no lugar errado? → mude-a.
3. Precisa de documentação de contexto? → artefato externo (ADR, README).
4. Só depois: marca `code-smell` reconhecendo.

---

## Escopo: onde a regra vale e onde não

### ✅ Regra vale (código de app)

- **Linguagens de negócio:** JavaScript/TypeScript, Python, Java, Go, C/C++, C#, Ruby, PHP, Rust, Kotlin, etc.
- **Diretórios:** `src/`, `lib/`, `app/`, testes (`test/`, `spec/`).

### ❌ Regra NÃO vale (IaC e config)

- **Linguagens de config:** Terraform (`.tf`, `.tfvars`), YAML (`.yaml`, `.yml`), TOML, Shell (`.sh`), HCL, JSON, XML, etc.
- **Diretórios:** `infra/`, `terraform/`, `.github/workflows/`, `docker/`, `config/`.

**Por quê?** Infraestrutura é descritiva, não lógica de negócio. Comentário em Terraform (p.ex., "este bucket precisa de versioning porque histórico de compliance") é legítimo — explica *intenção de negócio*, não lógica de código. O agente **continuum** (IaC) anota infra normalmente.

---

## Como o enforcement funciona

A regra é imposta em **duas camadas**:

### Camada 1: Instrução (soft)

- **No `CLAUDE.md` global** (`~/.claude/CLAUDE.md`): instruções que dizem ao Claude para não escrever comentário.
- **Nos system prompts dos agentes:** cada agente carrega a regra no seu contexto:
  - **limpio** (desenvolvimento): não gera comentário explicativo
  - **vitro** (frontend): mesmo
  - **glossia** (documentação): documenta em artefatos **externos** (`.md`, OpenAPI), nunca inline
  - **pura** (limpeza): remove comentários existentes

### Camada 2: Hook PreToolUse (hard/determinístico)

Um hook `PreToolUse` chamado `block-comments.mjs` roda **antes** de qualquer `Write`, `Edit`, ou `MultiEdit` ser executado. Ele:

1. **Tokeniza** o arquivo char-a-char (não usa regex ingênuo).
2. **Identifica comentários** de linha (`//`, `#`), bloco (`/* */`), e docstrings (Python `"""`).
3. **Filtra permitidos:** diretivas, markers, tickets, licença, `code-smell`.
4. **Bloqueia** se encontrar prosa — com mensagem clara.
5. **Funciona mesmo em subagentes:** quando um agente delega e o subagente tenta escrever comentário, o hook bloqueia no nível do tool call.

**Linguagens suportadas:** JavaScript, TypeScript, Java, Go, C/C++, Python, Ruby, PHP, Rust, Kotlin, Scala, Dart, Swift e 20+ outras.

**Carros-chefe do detector:**

- **Sem falso-positivo em strings:** `const url = "https://example.com // not a comment"` — a URL não dispara bloqueio.
- **Sem falso-positivo em divisão inteira:** em Python, `//` (divisão inteira) nunca é tratado como comentário — em linguagens de `#`, só `#` marca comentário.
- **Sem falso-positivo em privados:** `#field` (JavaScript private) não é comentário.
- **Sem falso-positivo em regex literais (JS/TS):** padrões como `/[/*]/` ou `/https?:\/\//` são reconhecidos como regex (via heurística de posição de expressão), não como comentário.
- **Falha aberto:** se o hook falhar por razão interna, ele não trava o fluxo (exit 0) — a regra não deve impedir seu trabalho.

---

## Fluxo quando o hook bloqueia

### O que você vê

```
BLOQUEADO: comentario/docstring em codigo (regra Clean Code do Douglas — ~/.claude/CLAUDE.md).

Arquivo: src/auth/login.ts
  L23: // verifica se usuario pode fazer login
  L35: // envia email de confirmacao

Remova. Se voce acha que precisa explicar algo aqui, ISSO E CODE SMELL:
extraia para uma funcao/variavel com nome revelador em vez de comentar.

Permitido: cabecalho de licenca, diretivas de tooling (eslint-disable, @ts-expect-error,
type: ignore, pragma...), e — APENAS em ultimo caso absoluto — um comentario que contenha
explicitamente a palavra "code-smell" reconhecendo a divida tecnica.
```

### O que fazer

1. **Refatore o código:**
   - Renomeie variáveis/funções para revelar intenção.
   - Extraia blocos em funções pequenas.
   - Remova o comentário.

2. **Ou, em último caso, marque `code-smell`:**
   ```typescript
   // code-smell: X é complexo porque Y. Refactor planejado em PROJ-456.
   const result = complexCalculation();
   ```

3. **Roda `Write`/`Edit` de novo** — o hook deixa passar.

### Limpeza em massa de comentários legados

Se você tem um repositório inteiro carregado de comentários antigos e quer limpar:

1. **Delega ao agente `pura`:** ele remove comentários preservando lógica, formatação e tickets.
   ```
   /pura
   
   Remove todos os comentários de src/handlers/auth.ts, preservando código e tickets.
   ```

2. **Ou usa no default:** peça ao Claude que chame o pura.

---

## Instalação e verificação do hook

O hook é instalado como parte do passo 4 da [`01-instalacao.md`](01-instalacao.md).

**Para verificar que está ativo:**

```bash
# Deve retornar exit=2 (bloqueado)
echo '{"tool_name":"Write","tool_input":{"file_path":"x.ts","content":"// oi\nconst a=1\n"}}' \
  | node ~/.claude/hooks/block-comments.mjs; echo "exit=$?"

# Deve retornar exit=0 (permitido — é diretiva)
echo '{"tool_name":"Write","tool_input":{"file_path":"x.ts","content":"// eslint-disable\nconst a=1\n"}}' \
  | node ~/.claude/hooks/block-comments.mjs; echo "exit=$?"
```

Detalhes de configuração em [`../hooks/README.md`](../hooks/README.md).

---

## Receita rápida

| Situação | Solução |
|----------|---------|
| Hook bloqueou; preciso de comentário | Refatore: renomear, extrair função, isolar lógica. |
| Hook bloqueou; é realmente impossível refatorar | Marque `code-smell` reconhecendo a dívida. |
| Tenho código antigo cheio de comentário | Delegue ao agente **pura** para limpeza. |
| Preciso documentar *por quê* uma decisão? | Artefato externo: ADR (`docs/adr/`), README, ou docstring de tipo (não narrativa). Delegue ao agente **glossia**. |
| Hook está dando falso-positivo | Rare — abra issue com exemplo. O detector é char-a-char e cobre edge cases (URLs, privados, divisão). |

---

## Perguntas frequentes

**P: "Docstring de tipo em TypeScript/Python é permitida?"**  
R: Não. `@param`, `@returns`, e type hints (`:`) falam de tipo, e o nome deve revelar intenção. Se precisa de narrativa, isso é artefato externo (README, OpenAPI). Glossia documenta fora.

**P: "E comentário explicando um algoritmo complexo?"**  
R: Se o algoritmo é complexo, provavelmente deve estar em sua própria função nomeada, com testes que demonstram seu comportamento. Se ainda é necessária narrativa (p.ex., para um leitor aprender o algoritmo), fica em README/ADR/tutorial — não inline. Evite comentário a todo custo.

**P: "TODO sem ticket passa?"**  
R: Não. `TODO: PROJ-123 ...` (com ticket) passa. `TODO: fazer X` (sem ticket) é bloqueado — a tarefa vaga não é rastreável.

**P: "Posso ter comentário em arquivo de teste?"**  
R: Não — mesma regra. Teste é código. Se precisa explicar o comportamento, use nomes de teste claro: `testLoginWithInvalidEmailShouldReturnError`.

**P: "E comentário em SQL ou template?"**  
R: SQL e templates vivem em strings (ou arquivos). Se estão em strings, o detector só vê a string, não examina dentro — naturalmente permitido. Se estão em arquivo `.sql` ou `.html` puro, a extensão não está no escopo do detector, então comentário é permitido (é config/infra, não código de app).

---

## Conexões no kit

- **Agentes envolvidos:** **limpio** (implementação), **vitro** (frontend), **glossia** (documentação externa), **pura** (limpeza).
- **Hook relacionado:** [`../hooks/block-comments.mjs`](../hooks/block-comments.mjs) (o detector).
- **Instrução global:** [`../claude-md/global-CLAUDE.md.snippet`](../claude-md/global-CLAUDE.md.snippet) — seção "Comentários e docstrings em código".
- **Instalação:** passo 4 de [`01-instalacao.md`](01-instalacao.md).

---

Próximo: [`../hooks/README.md`](../hooks/README.md) — registrar o hook em `settings.json`.
