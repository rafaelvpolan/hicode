# hicode — Resumo Executivo do Plano

> Este é o **plano**, entregue antes de qualquer implementação. Leia este resumo e,
> se concordar, aprove as decisões em [`03-decisoes.md`](03-decisoes.md). Nada de código
> de produção é escrito até você dar o aval.

## O que é o hicode (em uma frase)

> Você não prompta os agentes — você desenha um **loop determinístico** que os prompta.
> Cada unidade de trabalho é um **card em disco** (uma spec leve + uma máquina de estados);
> um **batimento externo** (cron/GitHub Actions) descobre trabalho; por card, um **harness
> JS** executa o pipeline de agentes Nexus com **gates Crivo**, fecha o ciclo verde lendo
> **exit codes reais do disco** (nunca a fala do modelo), **verifica o resultado no banco**
> via MCP read-only, e abre o **PR**. A única porta humana obrigatória é o **merge do PR**.
> O repo lembra; a conversa esquece.

## De onde isso vem

Funde **duas metodologias** (análise em [`01-analise-metodologias.md`](01-analise-metodologias.md)):

- **Loop Engineering** (`METODOLOGIA.md`): os 5 blocos + memória — automações (heartbeat),
  worktrees, skills, conectores MCP, sub-agentes maker/checker, e estado em disco como espinha.
- **Framework Nexus** (`prompter-main/`): 15 agentes de escopo estreito + o gate adversarial
  **Crivo**, o helper `gated()` com retry/HALT, e o modo long-run autônomo.

O hicode **reusa as peças do Nexus** (catálogo de agentes + `gated()` + Crivo) dentro de um
**orquestrador novo** voltado para autonomia, e adota uma **variante leve do formato de spec
delta do OpenSpec** — sem trazer um segundo orquestrador de slash-commands para o repo.

## O pipeline que você pediu, mapeado 1:1

> **Regra fixa:** primeiro **executar a tarefa** (resultado + preview); só **depois** melhorar
> arquitetura, testes, segurança, review e limpeza. Você **vê o resultado** (ex.: a página nova)
> no **preview** antes de qualquer gate de qualidade.

**Fase 1 — Executar (resultado + preview):**

| Seu passo | Estado(s) | Dono | Humano? |
|---|---|---|---|
| tarefa | `INBOX` (+ `SPECCED`→`PLAN_APPROVED` só p/ mudança grande) | heartbeat / Crivo | — |
| **resultado** (executar) | `EXECUTED` | Limpio / Vitro / Radix (rápido, sem polir) | — |
| (ver o resultado) | `PREVIEW` | harness: **screenshot + URL viva** | — |
| **aprovação** | `PREVIEW_OK` | **você aprova o preview** (auto se não-visual) | ✅ leve |

**Fase 2 — Polir (só depois do preview aprovado):**

| Seu passo | Estado(s) | Dono | Humano? |
|---|---|---|---|
| (melhorar arquitetura) | `REFINED` | Rufus / Limpio + Crivo | — |
| testes/lint/ts | `TESTS_GREEN` | Testudo + harness (exit code em disco) | — |
| segurança | `SEC_CLEARED` | Escudo + Crivo | — |
| code-review | `REVIEWED` | **Crivo** (adversarial, sobre o diff) | — |
| (limpeza) | `CLEANED` | Pura / Pluto→Rufus | — |
| **PR (humano)** | `PR_OPEN → MERGED` | harness abre; **você revisa e dá merge** | ✅ **porta** |
| Deploy | `DEPLOYED` | GitHub Actions + verificação no banco | — (prod 1 clique, opcional) |

Estado de exceção: `HALTED` — quando o Crivo bloqueia 2×, a verificação falha de forma recorrente,
ou o **preview é rejeitado** N×, o card vai para a inbox em vermelho e espera você. É o disjuntor.

## As portas humanas (poucas, de propósito)

1. **Leve e cedo — aprovação do preview** (`PREVIEW_OK`): você olha o screenshot / abre a URL e
   diz se é o resultado certo. Auto-aprovada para mudanças sem superfície visual. É barata: valida
   a **intenção** antes de gastar esforço polindo.
2. **Obrigatória — merge do PR:** o PR vem com um dossiê (card + vereditos do Crivo + exit codes +
   verificação de banco + URL de preview-deploy) **e 1–3 perguntas dirigidas do Crivo sobre o
   diff** — para forçar leitura real e evitar "aprovar no automático" (anti-rendição-cognitiva).
3. **Opcional:** deploy de produção atrás de um *approval gate* de GitHub Environments.
4. **Exceção:** destravar um card `HALTED`.

## O que NÃO é da síntese crua — ajustes que já apliquei

O crítico de completude deu veredito **PRECISA_AJUSTES**. O plano abaixo já corrige:

- **Dashboard 100% self-contained** — HTML+CSS inline puro, **sem CDN/Chart.js** (a síntese se
  contradizia: "abre offline/CSP-safe" vs "Tailwind+Chart.js via CDN"). Detalhe em
  [`02-arquitetura.md`](02-arquitetura.md) §Dashboard.
- **Card com dois tamanhos** — mínimo para `risk:low`, completo só para `risk:high` (corta peso).
- **Sem relauncher long-run na v1** — o heartbeat é stateless e re-lê os cards do zero; o
  relauncher `--resume` só entra se houver um heartbeat genuinamente longo. Cortado por ora.
- **Janela de insegurança fechada** — proibido heartbeat 24/7 desacompanhado antes do
  *sandbox* (container + egress restrito). Veja [`05-riscos-e-ajustes.md`](05-riscos-e-ajustes.md).
- **Taxa de HALT / calibragem do Crivo** — risco→rigor, com meta de taxa-de-passagem, para o
  "quase sem humano" não virar "humano destrava fila vermelha o dia todo".

A lista completa de lacunas e cortes está em [`05-riscos-e-ajustes.md`](05-riscos-e-ajustes.md).

## Roadmap (incremental, cada fase demonstrável)

Detalhe em [`04-roadmap.md`](04-roadmap.md). Resumo:

- **Fase 0** — boot do kit (agentes + settings + hooks + template do dashboard).
- **Fase 1** — o card + caminho feliz de UM tipo (bug fix de CI vermelho) até o PR.
- **Fase 2** — heartbeat stateless local (cron) descobrindo trabalho.
- **Fase 3** — verificação de banco (Postgres MCP Pro read-only + staging efêmero).
- **Fase 4** — spec-model leve (`/spec` para mudanças grandes).
- **Fase 5** — deploy + 24/7 via GitHub Actions, com sandbox obrigatório antes de soltar.

## Decisões (respondidas em 2026-06-29)

Detalhe em [`03-decisoes.md`](03-decisoes.md):

1. **O que o hicode gerencia?** → **Outro repositório.** ⚠️ *Pendente: qual repositório.*
2. **Backend de banco:** → **Supabase** (MCP HTTP `read_only=true` + `project_ref`).
3. **Heartbeat primário:** → **cron local agora**, GitHub Actions na Fase 5.
4. **Escopo da v1:** → **caminho feliz enxuto** (bug fix de CI vermelho até o PR).

---

**Próximo passo:** leia [`01`](01-analise-metodologias.md)→[`05`](05-riscos-e-ajustes.md),
responda as decisões, e então começo pela **Fase 0**.
