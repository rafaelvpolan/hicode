---
id: 019
slug: criar-o-design-system-base-do-site-token
title: Criar o design system base do site (tokens + primitivos)
status: READY
risk: low
repo: rafaelvpolan/hicode-site
created: 2026-07-21T23:31:04Z
updated: 2026-07-21T23:31:04Z
---

## Objetivo
Consolidar e expandir o design system do hicode-site SOBRE o que ja existe (nao criar arquivo novo de tokens): o `src/style.css` `:root` ja e a fonte unica de tokens e os componentes ja usam `var(--...)`. (1) Completar no proprio `:root` as ESCALAS que faltarem (espacamento, raio, sombra, tamanhos/pesos de tipografia), mantendo a fonte unica em `src/style.css`. (2) Extrair COMPONENTES PRIMITIVOS reutilizaveis (Button, Card, Field, Container/Section) montados sobre esses tokens, em Vue 3 `<script setup lang=ts>`. (3) Substituir valores literais espalhados (cores/px soltos nos .vue) por `var(--token)`. Um so sistema de estilo (CSS + `<style scoped>`, como ja e). Reaproveitar tudo que existe.

## Log de Estado
2026-07-21T23:31:04Z CREATED status=READY (sprint)
