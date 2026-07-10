---
name: new-card
description: "Cria um novo card do hicode em cards/<NNN-slug>.md com frontmatter válido e esqueleto de corpo. Use quando o usuário pedir novo card, criar card, abrir card, ou registrar uma nova tarefa no backlog."
user-invocable: true
disable-model-invocation: true
argument-hint: "[título da tarefa]"
---

# /new-card — scaffold de card com frontmatter válido

**Regra do hicode:** o **card** (`cards/<NNN-slug>.md`) é a **espinha** — única fonte de verdade
editável. Este skill cria um card novo já no formato que o motor lê. Dashboard e índice são
**derivados**; nunca os edite à mão.

## Entrada

O título da tarefa vem no argumento (`$ARGUMENTS`). Se vier vazio, pergunte ao usuário uma frase
curta descrevendo a tarefa antes de continuar. Opcionalmente aceite `repo` (ex.:
`rafaelvpolan/hicode-site`) e `risk` (`low`/`high`); na dúvida use `risk: low` e `repo` vazio.

## Passos

1. **Calcule o próximo `NNN`** (zero-padded, gap-aware):
   ```bash
   ls cards/ | grep -oE '^[0-9]{3}' | sort -n | tail -1
   ```
   Some **+1** ao maior número existente (não reaproveite lacunas — sempre o maior + 1) e mantenha
   **3 dígitos** com `padStart(3,'0')` (ex.: `009` → `010`). Se não houver nenhum card, comece em `001`.
2. **Gere o `slug`** a partir do título, igual ao `slugify` do repo: minúsculas, sem acento
   (NFD + remove diacríticos), qualquer sequência não-`[a-z0-9]` vira `-`, tira `-` das pontas,
   **trunca em 40 caracteres**; se sobrar vazio, use `tarefa`.
3. **Confirme que `cards/<NNN>-<slug>.md` não existe** antes de escrever (não sobrescreva card).
4. **Escreva** `cards/<NNN>-<slug>.md` com o conteúdo abaixo.
5. Informe ao usuário o caminho criado. Não rode o motor nem mude estado — o card nasce em `READY`
   e o heartbeat/painel cuida do resto.

## Conteúdo do card

Frontmatter com **exatamente estas chaves, nesta ordem** (o mesmo que o painel emite em
`createCard`; o motor adiciona as demais — `branch`, `worktree`, `preview_url`, `cost_usd`,
`pr_url`… — ao longo do pipeline):

```
---
id: <NNN>
slug: <slug>
title: <título tal como o usuário escreveu>
status: READY
risk: low
repo: <repo ou vazio>
created: <ISO 8601 UTC, ex. 2026-07-09T14:03:00Z>
updated: <mesmo timestamp>
---

## Objetivo
<descrição da tarefa; se não houver, repita o título>

## Log de Estado
<mesmo timestamp> CREATED status=READY (sprint)
```

Use o timestamp ISO **sem milissegundos**, terminado em `Z` (ex.: `2026-07-09T14:03:00Z`) —
o mesmo formato do `isoNow()`. `created` e `updated` recebem o mesmo valor na criação.

## Observações

- `status` inicial é **sempre `READY`** (um dos `STATUSES` válidos em `lib/card/types.ts`), igual
  aos cards reais criados pelo painel. `INBOX` é reservado para triagem que ainda não virou trabalho;
  um card criado por pedido explícito do usuário já nasce pronto (`READY`).
- `risk: high` só quando a mudança for grande/cross-cutting/breaking (sinaliza spec via `/spec`);
  o padrão é `low`.
- Não invente chaves nem reordene: o `serializeCard` preserva a ordem, e o motor espelha essa
  estrutura. Cabeçalhos do corpo são `## Objetivo` e `## Log de Estado` — não mude os nomes
  (são lidos por regex em `lib/card/text.ts`).
