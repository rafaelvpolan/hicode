# 03 — Decisões

Cada decisão tem **opções + recomendação**. As 4 primeiras são **bloqueantes** (mudam o que eu
construo na Fase 0–1). As demais podem ser confirmadas mais tarde, mas registro a recomendação.

---

## ✅ Decisões tomadas (2026-06-29)

| # | Decisão | Escolha |
|---|---|---|
| **D1** | O que o hicode gerencia | **Outro repositório** desde já. ⚠️ *Pendente: qual repositório.* |
| **D2** | Backend de banco | **Supabase** → MCP oficial HTTP com `read_only=true` + `project_ref`. |
| **D3** | Heartbeat primário | **Local (cron) agora**, GitHub Actions na Fase 5. |
| **D4** | Escopo da v1 | **Caminho feliz enxuto** (bug fix de CI vermelho até o PR). |

Pendentes (confirmáveis depois): D5–D8 abaixo, recomendações mantidas.

---

## 🔴 Bloqueantes

### D1. O que o hicode gerencia?

O repo `hicode` hoje está **vazio** (só o `prompter-main` e o `METODOLOGIA.md`). O pipeline
(testes/lint/ts, banco, deploy) precisa de um **codebase-alvo**.

| Opção | Implicação |
|---|---|
| **A. Outro repositório** (o produto real) | hicode vira o "painel de controle"; os worktrees/PRs/deploy apontam para o repo-alvo. Mais útil, exige saber qual repo. |
| **B. O próprio hicode** (auto-hospedado) | hicode gerencia seu próprio desenvolvimento (dogfooding). Bom para validar o loop antes de apontar para produção. |
| **C. Template genérico** | Entrego o kit parametrizável; você pluga o repo-alvo depois. |

> **Recomendação:** **B na Fase 0–2** (dogfooding: o hicode se constrói com o próprio loop,
> risco baixo) → **A a partir da Fase 3**, apontando para o repo de produção que você indicar.
> Preciso saber **qual é o repo-alvo de produção** para as Fases 3–5.

### D2. Backend de banco do alvo

| Opção | MCP |
|---|---|
| **A. Postgres** (self-hosted / RDS / Aurora) | **Postgres MCP Pro** `--access-mode=restricted` + role `SELECT`-only em réplica |
| **B. Supabase** | MCP oficial HTTP `read_only=true` + `project_ref` |
| **C. Sem banco / outro (MySQL, Mongo...)** | `verify: sql` degrada para `verify: test`; reavaliamos o MCP |

> **Recomendação:** confirmar com você. **Default: Postgres MCP Pro** (mais maduro como
> verificador). Em qualquer caso, a fronteira real é o **usuário SELECT-only + réplica**, não a flag.

### D3. Heartbeat primário

| Opção | Trade-off |
|---|---|
| **A. cron/systemd local** | Controle total, sem segredo de OAuth no CI. Exige máquina ligada. |
| **B. GitHub Actions `on: schedule`** | 24/7 sem máquina, mas precisa `ANTHROPIC_API_KEY`/OAuth no CI + custo por run. |

> **Recomendação:** **começar local (Fase 2)** para calibrar custo/comportamento; **migrar para
> Actions (Fase 5)** quando o budget por ciclo estiver calibrado e o sandbox estiver pronto. Não
> são equivalentes — Actions é o caminho 24/7 final.

### D4. Escopo da v1

| Opção | O que entra |
|---|---|
| **A. Caminho feliz enxuto** (recomendado) | Fase 0→1: um tipo de card (bug fix de CI vermelho) até o PR, sem spec-model/deploy/db. Prova o loop antes de ampliar. |
| **B. Amplo desde já** | Tudo de uma vez (spec + db + deploy). Mais risco, demora mais para algo rodar. |

> **Recomendação:** **A**. A pesquisa e os juízes convergem: provar o loop num caminho estreito
> antes de generalizar. Cada fase do [roadmap](04-roadmap.md) é demonstrável.

---

## 🟡 Confirmáveis depois (registro a recomendação)

### D5. Estender o `crivo.md` para revisar spec e diff?

O Crivo do kit é charterizado só para revisar a saída dos 6 agentes gated. O hicode quer usá-lo
como **gate de spec** (estado 2) e **code-review do diff completo** (estado 6).

- **A. Estender** o `crivo.md` com essas duas dimensões **declaradas** no system prompt.
- **B. Não estender:** gate de plano vira gate humano leve só p/ `risk:high`; code-review = gate
  do último agente gated.

> **Recomendação:** **A**. Custo baixo (1 arquivo), e tornar a extensão **explícita** resolve a
> crítica de "uso fora do charter" — "extensão declarada" ≠ "reuso fingido".

### D6. Teto de custo: `--max-budget-usd` nativo ou wrapper verificável?

- **A. Confiar em `--max-budget-usd`** como teto duro nativo (se existir nesta instalação).
- **B. Wrapper** que soma `total_cost_usd` por ciclo e aborta (oficial no JSON headless).

> **Recomendação:** **B como primário** — `total_cost_usd` é campo oficial e verificável;
> `--max-budget-usd` ainda **não foi confirmado** existir. Aplicar a ela o mesmo ceticismo do
> "% de quota". Validar a flag antes de depender dela.

### D7. Quanto ritual de spec aplicar?

- **A. `/spec` só para grande/cross-cutting/breaking**; fix/typo nasce `READY` (Direct mode).
- **B. Spec para toda unidade** (Spec-Driven-First puro).

> **Recomendação:** **A**. O ritual proposal→delta→tasks é caro demais para bug/typo; o overhead
> não paga (pesquisa + juízes).

### D8. Sandbox real desde a Fase 1 ou só antes do 24/7?

- **A. Container/sandbox desde a Fase 1.**
- **B. `cwd-guard` + denylist agora; container obrigatório só na Fase 5** (antes de soltar
  desacompanhado).

> **Recomendação:** **B**, com um **gate explícito**: *proibido heartbeat 24/7 desacompanhado
> antes do container*. Nas fases iniciais o loop roda **supervisionado**. (Ver janela de
> insegurança em [`05`](05-riscos-e-ajustes.md).)

---

## Como responder

Pode responder em texto livre ("D1=B agora e A depois apontando pro repo X; D2=Postgres; ...") ou
eu te apresento as bloqueantes (D1–D4) num seletor. Assim que aprovar, começo pela **Fase 0**.

Próximo: [`04-roadmap.md`](04-roadmap.md).
