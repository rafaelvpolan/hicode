# CLAUDE.md — hicode

> **hicode** é o **painel de controle** e **repositório de estado** de um sistema autônomo de engenharia de IA.
> Funde **Loop Engineering** (`METODOLOGIA.md`) com o framework **Nexus** (15 agentes + gate Crivo, em `.claude/`).
> 
> O **motor** (execução, pipeline, gates, worktrees) vive num repo irmão: `/home/rpolan/projects/podium/hii`.
> O hicode comunica com o motor via **CLI** através de uma interface única (`MotorClient`), que futuramente evoluirá para **REST + SSE**.
> 
> O plano completo está em `plano/00..05`; a decisão de separação em `docs/adr/0001-motor-separado.md`.

## O que o hicode é

**Painel** (Vue 3 + Nuxt 4 + Bun): interface visual para cadastrar tarefas, aprovar previews, ler histórico e custos.

**Estado** (disco): `cards/` (fonte de verdade de tarefa) e `config/` (repositórios-alvo, preferências de IA, política de pipeline) — compartilhado com o motor.

**Contrato de ambiente:**
```bash
HICODE_CARDS_DIR=</caminho/ao/hicode>/cards
HICODE_REPOS_FILE=</caminho/ao/hicode>/config/repos.json
HICODE_IA_FILE=</caminho/ao/hicode>/config/ia.json
HICODE_RUNNER_PIDFILE=</caminho/ao/hicode>/.runner.pid
HICODE_RUNNER_LOCK=</caminho/ao/hicode>/.runner.lock
HII_HOME=</caminho/ao/hii>
```

O motor (em `hii/`) **lê** esses caminhos para coordenar execução; o painel **escreve** aqui para persistir intenção.

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

## Como o motor roda

- A **espinha** é o **card** (`cards/<NNN-slug>.md`): única fonte de verdade editável. Dashboard
  e índice são **derivados** dos cards, nunca co-autorados. Quem carimba estado/custo é o
  motor (hii) lendo `cards/runs/*.json` — **não** a fala do modelo.
- O **heartbeat** (cron local; GitHub Actions depois) roda `/hicode-triage` stateless: descobre
  trabalho, escreve cards, regenera o dashboard.
- Por card, o **motor do hii** executa o pipeline fase a fase chamando a IA por subprocesso,
  com **reajuste/retry + HALT** e o **gate crivo vinculante**, e fecha o **loop verde lendo exit code real em disco**.
  Detalhes: ver `hii/README.md`.
- A **configuração de pipeline** (quais steps rodam, ordem, ativado/desativado, gates) vive no motor (`hii/config/pipeline.json`
  e `<repo-alvo>/.hii/pipeline.json`). O painel **consulta e altera** essa config pelo `MotorClient`, nunca editando direto.
- **Merge é SEMPRE humano.** O motor termina em `PR_OPEN`: abre o PR e PARA.
  O motor e o Claude **NUNCA** dão merge — nada de `gh pr merge`. Quem revisa o diff e mergeia é o
  humano, no GitHub. Mesmo se o usuário disser "fazer o merge", o agente deixa o PR pronto e aponta
  o link; o clique de merge é do humano. É a porta anti-rendição-cognitiva.
- **Toda task parte do `main` ATUALIZADO.** Antes de criar a branch de trabalho: `git fetch origin
  main` + `pull --ff-only` (ou, em worktree, criar de `origin/main` recém-buscado). Nunca ramificar
  de estado velho nem de outra branch de feature.
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
- Frontend (Vue 3/Nuxt, React/RN/Solid) → **vitro**
- Estrutura/design-system de frontend (gated, roda **antes** do crivo) → **frontiteto** (pareia com **vitro**)
- Design system de UI (tokens, primitivos, reuso) → o **motor injeta um brief de design system** + as **imagens de referência** do card (links/uploads baixados, via visão) no prompt de cards visuais; **`frontiteto`** impõe a consistência (gated). Direção estética manual/pontual → skill **`frontend-design`**
- CI/CD, IaC, deploy → **continuum** (gera, **nunca aplica**)
- Observabilidade (logs, métricas, tracing, RCA) → **corvinus**
- Documentação (.md, ADR, OpenAPI, diagramas) → **glossia**
- Apresentações/dashboards `.html` → **fulgor**
- Pesquisa externa (libs, docs, RFCs, trade-offs) → **quaero**
- Remover comentários → **pura**
- Revisão adversarial após agente gated, gate de spec, code-review de diff → **crivo**

Regras:
- Pipeline multi-agente (ordem/gates) → prefira **`/nexus`** (manual) ou o harness por card (autônomo).
- Resultado de agente **gated** (limpio, escudo, testudo, rufus, radix, celer, frontiteto) passa pelo **crivo**
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

## Segurança (painel + motor)

**Painel:**
- `acceptEdits` (nunca `bypassPermissions`)
- Endpoints mutantes só aceitam requisição de loopback (127.0.0.1)
- Origin-guard: POST/PUT/PATCH/DELETE rejeitam origem estrangeira (previne CSRF)

**Motor (hii):**
- `cwd-guard` confina execução ao worktree do card
- denylist de ops destrutivas (conveniência, não fronteira)
- banco read-only via role SELECT-only
- **proibido rodar 24/7 desacompanhado antes do sandbox** (container + egress restrito)

Detalhe completo: `plano/02-arquitetura.md` §7 (ainda menciona detalhes do motor; ver `hii/README.md` para implementação atual).
