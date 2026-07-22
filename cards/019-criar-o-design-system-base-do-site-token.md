---
id: 019
slug: criar-o-design-system-base-do-site-token
title: Criar o design system base do site (tokens + primitivos)
status: EXECUTING
risk: high
repo: rafaelvpolan/hicode-site
created: 2026-07-21T23:31:04Z
updated: 2026-07-22T00:08:16Z
surface: visual
clarified: true
branch: hicode/019-criar-o-design-system-base-do-site-token
worktree: /home/rpolan/projects/.hicode-worktrees/hicode-site/019-criar-o-design-system-base-do-site-token
preview_url: http://localhost:5219
preview_pid: 1811895
---

## Objetivo
Consolidar e expandir o design system do hicode-site SOBRE o que ja existe (nao criar arquivo novo de tokens): o `src/style.css` `:root` ja e a fonte unica de tokens e os componentes ja usam `var(--...)`. (1) Completar no proprio `:root` as ESCALAS que faltarem (espacamento, raio, sombra, tamanhos/pesos de tipografia), mantendo a fonte unica em `src/style.css`. (2) Extrair COMPONENTES PRIMITIVOS reutilizaveis (Button, Card, Field, Container/Section) montados sobre esses tokens, em Vue 3 `<script setup lang=ts>`. (3) Substituir valores literais espalhados (cores/px soltos nos .vue) por `var(--token)`. Um so sistema de estilo (CSS + `<style scoped>`, como ja e). Reaproveitar tudo que existe.
## Log de Estado
2026-07-21T23:31:04Z CREATED status=READY (sprint)
2026-07-21T23:57:42Z READY->EXECUTING iniciado pelo painel
2026-07-21T23:57:45Z classificacao previa: tarefa VISUAL (sinal visual: "design")
2026-07-21T23:57:46Z EXECUTING->PAUSED pausado pelo painel
2026-07-21T23:57:53Z clarify: tarefa clara — seguindo sem perguntas
2026-07-21T23:57:53Z EXECUTING: preparando worktree hicode/019-criar-o-design-system-base-do-site-token
2026-07-21T23:57:55Z preview subindo em http://localhost:5219 — acompanhe pelo link enquanto a IA trabalha
2026-07-21T23:57:59Z EDIT tarefa via painel
2026-07-21T23:58:01Z PAUSED->EXECUTING retomado pelo painel
2026-07-22T00:08:13Z EXECUTING interrompido por reinicio do daemon — sera reexecutado
2026-07-22T00:08:13Z EXECUTING: preparando worktree hicode/019-criar-o-design-system-base-do-site-token
2026-07-22T00:08:16Z preview subindo em http://localhost:5219 — acompanhe pelo link enquanto a IA trabalha
