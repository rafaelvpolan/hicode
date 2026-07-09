---
name: spec
description: "Escrever um OpenSpec change (`## ADDED/MODIFIED/REMOVED Requirements`, `### Requirement:` com MUST/SHALL, `#### Scenario:` com `- **WHEN**` / `- **THEN**`) para mudança grande, cross-cutting ou breaking. Use quando o usuário disser spec, criar spec, openspec, ou for uma mudança grande/breaking/cross-cutting."
user-invocable: true
argument-hint: "[o que a mudança faz]"
---

# /spec — OpenSpec change

**Regra do hicode:** só mudança **grande / cross-cutting / breaking** ganha spec. Fix, typo,
ajuste de uma linha nasce **direto** (Direct mode) — sem spec. O spec fecha o **escopo** e a
**verificação** antes do Crivo aprovar o plano (`PLAN_APPROVED`).

Este skill é o equivalente **interativo** do que o motor gera sozinho em `lib/runner/spec-phase.ts`
(agente **glossia**) e valida com `openspec validate --strict`. Escreva no **mesmo formato**, senão
a validação reprova e o card vai a `HALTED`.

## Quando fazer spec (e quando pular)

| Situação | Ação |
|----------|------|
| Feature nova grande, muda vários módulos, quebra contrato/API/schema | **`/spec`** |
| Comportamento cross-cutting (auth, permissões, migração de dados) | **`/spec`** |
| Fix, typo, copy, ajuste de estilo, 1–2 linhas sem risco | **pular** → Direct mode |

Na dúvida: se a mudança precisa de **Crivo no plano** ou toca **≥2 domínios**, faça spec.

## Onde vive e quais arquivos

O change fica em `openspec/changes/<name>/` (o motor usa `card-<id>`). Três arquivos:

- `proposal.md` — seções `## Why` e `## What Changes`.
- `tasks.md` — seções `## 1. ...` com itens `- [ ]`.
- `specs/<capability>/spec.md` — os deltas de requisito (formato abaixo).

## Estrutura exata que o validador aceita

O `openspec validate --strict` é **rígido com as palavras-chave em inglês** — não traduza. O que é
**load-bearing** (comprovado rodando o CLI):

- Cabeçalho de bloco: `## ADDED Requirements` · `## MODIFIED Requirements` · `## REMOVED Requirements`
  (plural, inglês, verbatim).
- Requisito: **`### Requirement: <nome>`** (inglês — `### Requisito` **NÃO** valida: dá
  `no requirement entries parsed... include at least one "### Requirement:" block`), seguido de
  **uma frase normativa com `MUST` ou `SHALL`**.
- Cenário: `#### Scenario: <nome>` com bullets `- **GIVEN**` / `- **WHEN**` / `- **THEN**` / `- **AND**`.
- **Todo Requirement precisa de ≥ 1 Scenario** e da palavra **`MUST`/`SHALL`** no texto.
- `MODIFIED` carrega o **texto completo** do requisito (não só o diff).
- `REMOVED` carrega `Reason:` (e `Migration:` quando houver migração).

## Tag `verify:` — convenção do hicode (opcional, não é do openspec)

O openspec **ignora** a tag (é um comentário HTML) — ela **não** é exigida pela validação. É uma
**convenção interna do hicode** que roteia a verificação de cada Cenário. Use quando quiser marcar
como o Cenário será checado:

- `verify: sql` → estado checável no banco → query do **Radix** (degrada para `test` sem réplica/staging).
- `verify: test` → lógica → teste do **Testudo**.
- `verify: manual` → UI/percepção → confirmação humana no preview.

## Esqueleto preenchido (pt-BR, palavras-chave em inglês)

```md
## ADDED Requirements

### Requirement: Autenticação em dois fatores (2FA)
The system MUST support TOTP-based two-factor authentication no login.

#### Scenario: Enrolamento de 2FA <!-- verify: test -->
- **GIVEN** um usuário sem 2FA ativo
- **WHEN** ele ativa 2FA nas configurações
- **THEN** um QR code é exibido
- **AND** ele precisa confirmar um código válido antes de o 2FA ficar ativo

#### Scenario: Login exige o segundo fator <!-- verify: sql -->
- **GIVEN** um usuário com 2FA ativo
- **WHEN** ele faz login com usuário e senha corretos
- **THEN** a sessão fica pendente até validar o TOTP
- **AND** a coluna `sessions.mfa_verified` só vira `true` após o código correto

## MODIFIED Requirements

### Requirement: Rate limit de login
The system MUST limitar a 5 tentativas de login por minuto por IP (antes: 10).

#### Scenario: Bloqueio após 5 tentativas <!-- verify: test -->
- **GIVEN** 5 tentativas de login falhas do mesmo IP em 1 minuto
- **WHEN** chega a 6ª tentativa
- **THEN** a requisição é rejeitada com HTTP 429

## REMOVED Requirements

### Requirement: Login por SMS
Reason: SMS é inseguro (SIM-swap) e foi substituído por TOTP.
Migration: usuários com SMS são migrados para TOTP no primeiro login pós-deploy.
```

## Validar

```bash
openspec validate card-<id> --strict --json --no-interactive
```

Erro clássico: `must contain SHALL or MUST` (faltou a frase normativa no Requirement).

## Anti-padrões

- ❌ Fazer spec para fix/typo (use Direct mode).
- ❌ **Traduzir `### Requirement:` para `### Requisito`** — reprova na validação.
- ❌ Requisito sem `MUST`/`SHALL` no texto (o validador reprova).
- ❌ Requisito sem Scenario.
- ❌ Traduzir os cabeçalhos (`ADDED/MODIFIED/REMOVED Requirements` são verbatim).
- ❌ Vender cobertura: só marque `verify: sql`/`test` no que dá pra checar de verdade.
