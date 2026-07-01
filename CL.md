# CLAUDE.md — hicode

> Este documento é a autoridade máxima de instruções deste repositório.
> Em caso de conflito com qualquer outro arquivo, este documento prevalece.

## Visão Geral

O **hicode** é um gerenciador autônomo de projetos baseado em:

- Loop Engineering (`METODOLOGIA.md`)
- Framework Nexus (`.claude/`)
- Plano arquitetural (`plano/00..05`)

O hicode **não desenvolve este repositório**.

Este repositório contém apenas o motor.

O produto é desenvolvido em um **repositório-alvo**, onde acontecem:

- branches
- worktrees
- commits
- pull requests
- testes
- preview
- deploy

Até que um repositório seja configurado, o loop é validado localmente.

---

# Princípio Fundamental

Sempre validar a **intenção** antes de otimizar a implementação.

Toda tarefa (card) segue obrigatoriamente esta ordem:

1. EXECUTED
   - implementar apenas o mínimo necessário
   - não refatorar
   - não otimizar
   - não executar testes completos

2. PREVIEW
   - subir aplicação
   - gerar URL
   - gerar screenshot
   - atualizar dashboard

3. PREVIEW_OK
   - aprovação humana
   - caso rejeitado, retornar para EXECUTED

Somente após PREVIEW_OK executar:

- REFINED
- TESTS_GREEN
- SEC_CLEARED
- REVIEWED
- CLEANED

Depois:

- abrir PR
- aguardar merge humano
- deploy

Nunca inverter esta sequência.

---

# Modelo Operacional

A unidade de trabalho é sempre um **Card**.

```
cards/
```

O card é a única fonte de verdade editável.

Dashboard, índices e métricas são derivados automaticamente.

Jamais editar arquivos derivados manualmente.

Estados e custos nunca são inferidos pelo modelo.

Eles são determinados exclusivamente pelo harness através de:

```
cards/runs/*.json
```

---

# Execução

O heartbeat executa continuamente:

```
/hicode-triage
```

Responsabilidades:

- descobrir trabalho
- gerar cards
- atualizar dashboard

Cada card é executado pelo harness:

```
workflows/card-pipeline.mjs
```

Pipeline:

- gated()
- retry(2)
- HALT do Nexus

O sucesso é determinado apenas pelo exit code real.

Nunca assumir sucesso baseado em mensagens do modelo.

---

# Aprovação

No modo autônomo não existe confirmação interativa.

CONFIRM é substituído por:

- PLAN_APPROVED
- PREVIEW_OK
- PR

O merge é sempre humano.

É proibido:

```
gh pr merge
```

Mesmo quando solicitado.

O agente apenas:

- abre o PR
- fornece o link
- encerra a execução

---

# Specs

Criar Spec apenas quando houver:

- mudanças grandes
- breaking changes
- alterações cross-cutting

Correções pequenas utilizam Direct Mode.

Formato:

OpenSpec Delta

```
ADDED
MODIFIED
REMOVED
```

Cada cenário deve possuir:

```
verify:
```

Valores:

- sql
- test
- manual

---

# Banco de Dados

Banco é utilizado apenas como verificador.

Ferramenta:

Supabase MCP

Sempre:

- read_only=true

Nunca executar:

- INSERT
- UPDATE
- DELETE
- ALTER

A fronteira real é um role SELECT-only.

---

# Roteamento de Agentes

Delegue qualquer trabalho substancial ao agente especializado.

Faça diretamente apenas:

- leitura
- exploração
- tarefas pequenas
- dúvidas conceituais
- orquestração

## Catálogo

Feature
→ limpio

Refatoração
→ rufus

Dead code
→ pluto

Testes
→ testudo

Segurança
→ escudo

Banco
→ radix

Performance
→ celer

Frontend
→ vitro

CI/CD
→ continuum

Observabilidade
→ corvinus

Documentação
→ glossia

Dashboards HTML
→ fulgor

Pesquisa
→ quaero

Remover comentários
→ pura

Revisão adversarial
→ crivo

---

# Gates

Todo resultado produzido por:

- limpio
- rufus
- escudo
- testudo
- radix
- celer

deve obrigatoriamente passar pelo:

```
crivo
```

antes de ser considerado concluído.

Nunca inventar novos agentes.

---

# Convenções

É proibido adicionar:

```
Co-Authored-By
```

ou

```
Generated with Claude
```

em commits ou PRs.

---

# Código

Seguir Clean Code.

Não escrever comentários explicando implementação.

Se precisar explicar:

refatore.

Comentários permitidos:

- licença
- eslint-disable
- ts-expect-error
- type: ignore
- TODO
- FIXME
- HACK
- referência de ticket

Comentários de infraestrutura são permitidos.

Remoção automática:

```
pura
```

---

# Segurança

Sempre utilizar:

```
acceptEdits
```

Nunca utilizar:

```
bypassPermissions
```

Cada agente deve permanecer restrito ao worktree do card.

Deploy nunca é aplicado automaticamente.

O agente Continuum apenas gera artefatos.

É proibido executar o sistema continuamente fora do sandbox.

O sandbox deve possuir:

- isolamento por container
- egress restrito

---

# Regras Absolutas

Nunca assumir sucesso.

Nunca modificar arquivos derivados.

Nunca inverter a ordem do pipeline.

Nunca fazer merge.

Nunca aplicar deploy.

Nunca executar operações destrutivas no banco.

Nunca criar agentes inexistentes.

Quando houver dúvida, interrompa a execução e solicite intervenção humana.