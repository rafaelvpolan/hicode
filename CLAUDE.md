# CLAUDE.md — hicode

> **hicode** é um gerenciador de projetos autônomo que funde **Loop Engineering**
> (`METODOLOGIA.md`) com o framework **Nexus** (15 agentes + gate Crivo, adaptado de
> `prompter-main`, agora em `.claude/`). O plano de projeto completo está em `plano/00..05`.
> Esta é a **autoridade de instrução** deste repositório.

## O que o hicode gerencia

O hicode é o **plano de controle**; ele gerencia **outro repositório** (o produto-alvo). O
repo-alvo de produção ainda **não foi confirmado** — até lá, valida-se o loop localmente. Os
worktrees, PRs, testes/lint e deploy operam contra o repo-alvo, não contra este.

## Princípio nº 1 — Executar primeiro, polir depois

Ordem **fixa** de toda unidade de trabalho (card):

1. **Executar a tarefa** → resultado funcional **mínimo, sem polir** (`EXECUTED`).
2. **Preview** → o app sobe no worktree, gera **screenshot + URL viva**; aparece no dashboard
   (`PREVIEW`). É **onde o resultado é visto** (ex.: uma página nova).
3. **Aprovação do preview** (`PREVIEW_OK`) → humano confirma que é o resultado certo (auto para
   mudanças sem superfície visual). Rejeição volta a `EXECUTED` com o motivo.
4. **Só então polir:** melhorar arquitetura (`REFINED`) → testes/lint/ts (`TESTS_GREEN`) →
   segurança (`SEC_CLEARED`) → code-review (`REVIEWED`) → limpeza (`CLEANED`).
5. **PR (humano)** → **Deploy**.

Nunca rodar testes/refactor/segurança antes do preview aprovado: valida-se a **intenção** cedo.

## Modelo autônomo (como o hicode roda)

- A **espinha** é o **card** (`cards/<NNN-slug>.md`): única fonte de verdade editável. Dashboard
  e índice são **derivados** dos cards, nunca co-autorados. Quem carimba estado/custo é o
  harness/hook lendo `cards/runs/*.json` — **não** a fala do modelo.
- O **heartbeat** (cron local; GitHub Actions depois) roda `/hicode-triage` stateless: descobre
  trabalho, escreve cards, regenera o dashboard.
- Por card, o **harness** (`workflows/card-pipeline.mjs`, via Workflow tool) executa o pipeline com
  o `gated()` + retry(2) + HALT do Nexus, e fecha o **loop verde lendo exit code real em disco**.
- **CONFIRM substituído:** no modo autônomo, a fase `CONFIRM` interativa do `/nexus` é trocada pelo
  **gate Crivo sobre o plano** (`PLAN_APPROVED`) + a **aprovação do preview** + a **porta do PR**.
  O `/nexus` interativo continua disponível para trabalho manual.
- **Merge é SEMPRE humano.** O fluxo automatizado (motor) termina em `PR_OPEN`: abre o PR e PARA.
  O motor e o Claude **NUNCA** dão merge — nada de `gh pr merge`. Quem revisa o diff e mergeia é o
  humano, no GitHub. Mesmo se o usuário disser "fazer o merge", o agente deixa o PR pronto e aponta
  o link; o clique de merge é do humano. É a porta anti-rendição-cognitiva.
- **Toda task parte do `main` ATUALIZADO.** Antes de criar a branch de trabalho: `git fetch origin
  main` + `pull --ff-only` (ou, em worktree, criar de `origin/main` recém-buscado). Nunca ramificar
  de estado velho nem de outra branch de feature. Detalhe na skill **`branch-from-main`**; o motor
  já cumpre isso em `prepareBranch`/`ensureWorktree`.
- **Spec só para mudança grande/cross-cutting/breaking** (`/spec`); fix/typo nasce direto (Direct
  mode). Formato: spec delta estilo OpenSpec (`## ADDED/MODIFIED/REMOVED Requirements`, `### Requisito`,
  `#### Cenário` GIVEN/WHEN/THEN), cada Cenário com tag `verify: sql|test|manual`.
- **Verificação de banco:** Supabase MCP (`read_only=true` + `project_ref`) como verificador
  read-only; a fronteira real é um role SELECT-only num projeto de dev.

## Roteamento de agentes (modo default, sem digitar `/nexus`)

Delegue **trabalho de domínio substancial** ao agente certo; faça você mesmo só o trivial
(poucas linhas), leitura/exploração, dúvidas conceituais e a própria orquestração.

- Implementar/revisar/refatorar feature → **limpio**
- Refatoração segura sem mudar comportamento → **rufus**
- Dead-code (sinaliza, não remove) → **pluto**
- Testes (escrever, cobertura, mutation) → **testudo**
- Segurança (auth, secrets, CVE, IaC) → **escudo**
- Banco/dados (schema, migrations, índices, queries) → **radix**
- Performance (profiling, otimização) → **celer**
- Frontend (React/RN/Solid) → **vitro**
- CI/CD, IaC, deploy → **continuum** (gera, **nunca aplica**)
- Observabilidade (logs, métricas, tracing, RCA) → **corvinus**
- Documentação (.md, ADR, OpenAPI, diagramas) → **glossia**
- Apresentações/dashboards `.html` → **fulgor**
- Pesquisa externa (libs, docs, RFCs, trade-offs) → **quaero**
- Remover comentários → **pura**
- Revisão adversarial após agente gated, gate de spec, code-review de diff → **crivo**

Regras:
- Pipeline multi-agente (ordem/gates) → prefira **`/nexus`** (manual) ou o harness por card (autônomo).
- Resultado de agente **gated** (limpio, escudo, testudo, rufus, radix, celer) passa pelo **crivo**
  antes de "pronto".
- Nunca inventar agentes fora do catálogo. Se nenhum se aplica, faça você mesmo.

## Convenções globais

- **NUNCA** adicionar trailer `Co-Authored-By: Claude ...` em commits, nem `🤖 Generated with
  Claude Code` em PRs.
- **Clean Code (Uncle Bob):** **não** escrever comentários/docstrings que expliquem a lógica do
  código — se "precisa de explicação", extraia para nomes reveladores. Permitido: cabeçalho de
  licença, diretivas de tooling (`eslint-disable`, `@ts-expect-error`, `type: ignore`...),
  marcadores acionáveis (`TODO`/`FIXME`/`HACK`), referência de ticket. Imposto pelo hook
  `.claude/hooks/block-comments.mjs`. Não vale para IaC/config (`.tf`, `.yaml`, `.sh`). Limpeza
  reativa → agente **pura**.
- **Proibido código monolítico:** arquivo de código não pode passar de **350 linhas** nem ser
  um **god-file** (**≥20 funções e <3 exports**). Separe em módulos coesos — **types** num
  arquivo, **helpers** puros em outro, cada grupo de **funções/responsabilidade** no seu próprio
  arquivo. Em `.vue`, extraia lógica para **composables** e quebre em **componentes** menores.
  Imposto pelo hook `.claude/hooks/block-monolithic.mjs` (conta só o `<script>` em `.vue`; não
  vale para config/IaC/docs). Exceção com dívida técnica assumida: diretiva `hicode:allow-monolith`
  no topo do arquivo.
- **Tudo tipado (`strict`):** proibido `any` (explícito ou implícito); toda função com tipo de
  retorno; `$fetch<T>()` sempre tipado. **Frontend é Vue 3 Composition API** (`<script setup
  lang="ts">` + composables) — **nunca React/JSX**. `typecheck` (`tsc --noEmit` na raiz,
  `nuxi typecheck` no painel) faz parte da suíte de testes.

## Segurança (modo autônomo)

`acceptEdits` (nunca `bypassPermissions`); `cwd-guard` confina cada agente ao worktree do card;
denylist de ops destrutivas (conveniência, não fronteira); banco read-only via role SELECT-only;
Continuum nunca aplica deploy; **proibido rodar 24/7 desacompanhado antes do sandbox** (container
+ egress restrito). Detalhe em `plano/02-arquitetura.md` §7.
