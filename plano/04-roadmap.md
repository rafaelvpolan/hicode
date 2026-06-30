# 04 — Roadmap de Implementação

Incremental e **demonstrável a cada fase**. Cada fase entrega algo que roda; nada de "big bang".
Os cortes de escopo do crítico (ver [`05`](05-riscos-e-ajustes.md)) já estão refletidos.

---

## Fase 0 — Boot do kit  *(fundação, sem loop ainda)*

**Entrega:**
- `CLAUDE.md` (roteamento Nexus + regras do repo).
- Os 15 agentes Nexus em `.claude/agents/` (com `crivo.md` **estendido** p/ spec+diff — D5).
- `.claude/settings.json`: `permissions.deny` (denylist) + `defaultMode: acceptEdits` +
  `cwd-guard` e quota-gate com **matchers separados** `Bash|Edit|Write|Read`.
- `block-comments.mjs` (do kit).
- Fulgor cria o **template do dashboard UMA vez** (HTML+CSS inline, **sem CDN**).

**Demo:** rodar `/nexus` manualmente num card de teste e ver `gated()`+Crivo funcionando; abrir o
template do dashboard no browser (vazio, mas renderizando).

---

## Fase 1 — CARD + Executar→Preview de UM tipo  *(prova o "executar primeiro")*

**Tipo escolhido:** uma mudança de **UI simples** (ex.: adicionar uma página nova) — é onde o
**preview** importa e é o que você quer ver. (Bug fix de CI vermelho entra como segundo tipo.)

**Entrega:**
- Formato do card (mínimo + completo), `cards/runs/*.json` e `cards/previews/<id>/`.
- `stamp-card.sh` (Stop: carimba status/cost lendo `runs/`).
- `render-dashboard.sh` (determinístico, sem LLM) **com o painel de Preview** (screenshot + URL).
- **Mecanismo de preview**: o harness sobe o app no worktree (skill `run`) + captura o screenshot
  (headless) + publica a URL viva.
- CLI fino `hicode approve|reject <id>`.
- `card-pipeline.mjs` **mínimo**: maker (Vitro/Limpio) → `EXECUTED` → **`PREVIEW`** → (aprovado) →
  Testudo + **loop verde lendo exit code** → `gh pr create`. Refactor/segurança/limpeza entram só
  conforme o card pedir.
- **Sem** spec-model, **sem** deploy, **sem** db ainda.

**Demo:** criar um card de "página nova" → o harness **executa** (resultado mínimo) → o **dashboard
mostra o screenshot + a URL** → você abre, interage e **aprova** → o harness segue para
testes/lint, abre o PR → o dashboard reflete o kanban e o custo somado. **Você vê o resultado antes
de qualquer teste.**

---

## Fase 2 — Heartbeat stateless  *(o loop começa a se alimentar)*

**Entrega:**
- `/hicode-triage`: GC de worktrees → lê CI/issues/commits → escreve cards → regenera dashboard.
- `orchestration/crontab.example` (heartbeat local — D3 opção A).
- Auto-alimentação básica: `HALTED` → inbox.

**Demo:** o cron local dispara o heartbeat; ele descobre um CI vermelho **real**, cria o card, e o
caminho da Fase 1 o leva até o PR sozinho. Custo do ciclo aparece no dashboard.

> ⛔ **Gate de segurança:** até aqui o loop roda **supervisionado** (você acompanha). 24/7
> desacompanhado **só** depois do sandbox da Fase 5.

---

## Fase 3 — Verificação de banco  *(MCP read-only)*

**Entrega:**
- `.mcp.json` (Postgres MCP Pro `--access-mode=restricted` — ou Supabase, conforme D2).
- Role `hicode_verificador` `SELECT`-only (idealmente em réplica).
- Radix derivando `verify_sql` dos Cenários `verify: sql`.
- Job de CI que aplica a migration em **staging efêmero**; Crivo revisa o `verify_sql`.
- Fallback declarado: sem réplica/staging, `verify: sql` → `verify: test`.

**Demo:** um card que toca schema → migration aplicada em staging efêmero → Radix verifica
invariantes read-only → resultado no card e no corpo do PR.

---

## Fase 4 — Spec-model leve  *(spec-driven para mudança grande)*

**Entrega:**
- Skills `/spec` (com validação embutida) e `/spec-archive` (merge transacional em `specs/`).
- `specs/<domínio>.md` (fonte de verdade).
- Cards grandes passam por `SPECCED → PLAN_APPROVED` com gate Crivo.

**Demo:** uma feature cross-cutting → `/spec` gera os Cenários → Crivo aprova o plano → o pipeline
implementa → o merge mescla o delta em `specs/`.

---

## Fase 5 — Deploy + 24/7  *(produção desacompanhada)*

**Entrega:**
- Continuum gera `ci.yml` / `deploy.yml`; `heartbeat.yml` (Actions cron — D3 opção B).
- **Sandbox obrigatório** (container FS-escopado + egress restrito) — pré-requisito para soltar.
- `Environment approval` em prod (a porta humana opcional).
- Corvinus pós-deploy + card de rollback automático *(opcional — pode ficar no nível do Actions
  primeiro; ver corte em [`05`](05-riscos-e-ajustes.md))*.

**Demo:** merge dispara deploy de staging automático; prod atrás de 1 clique; o heartbeat roda
24/7 via Actions sem máquina ligada; Corvinus confirma a saúde.

---

## Visão de dependências

```
Fase 0 ─▶ Fase 1 ─▶ Fase 2 ─┬─▶ Fase 3 ─┐
                            └─▶ Fase 4 ─┴─▶ Fase 5
```

Fases 3 e 4 são independentes entre si (podem ser feitas em qualquer ordem ou em paralelo) e
ambas precedem a 5. A v1 utilizável já existe ao fim da **Fase 2**.

Próximo: [`05-riscos-e-ajustes.md`](05-riscos-e-ajustes.md).
