---
id: 005
slug: selo-beta-no-topo
title: Selo beta no topo
status: PR_OPEN
risk: low
repo: rafaelvpolan/hicode-site
created: 2026-06-30T11:05:07Z
updated: 2026-06-30T11:11:41Z
branch: hicode/005-selo-beta-no-topo
cost_usd: 1.0201
tokens_total: 1465
preview_url: http://localhost:5173
pr_url: https://github.com/rafaelvpolan/hicode-site/pull/3
---

## Objetivo
No cabecalho (nav) do site, adicione um pequeno selo discreto com o texto beta ao lado do nome hicode.

## Log de Estado
2026-06-30T11:05:07Z CREATED status=READY (sprint)
2026-06-30T11:05:07Z READY->EXECUTING iniciado pelo painel
2026-06-30T11:06:25Z EXECUTING->EXECUTED **vitro** atuou (revisado e APROVADO pelo **crivo**): adicionou `<span class="beta">beta</span>` ao lado de "hicode" no `.brand` do header e (custo $1.0201 · 1465 tokens)
2026-06-30T11:06:30Z EXECUTED->PREVIEW http://localhost:5173 + screenshot
2026-06-30T11:06:42Z PREVIEW->PREVIEW_OK preview aprovado
2026-06-30T11:10:54Z PREVIEW_OK->TESTS_GREEN npm run build exit=0
2026-06-30T11:10:56Z HALTED erro: msg is not defined
2026-06-30T11:11:36Z HALTED->PREVIEW_OK preview aprovado
2026-06-30T11:11:38Z PREVIEW_OK->TESTS_GREEN npm run build exit=0
2026-06-30T11:11:41Z REVIEWED->PR_OPEN https://github.com/rafaelvpolan/hicode-site/pull/3
