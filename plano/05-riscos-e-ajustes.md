# 05 — Riscos, Lacunas e Ajustes

Honestidade primeiro. A síntese da arquitetura passou por um **crítico de completude
adversarial** que deu veredito **`PRECISA_AJUSTES`**. Esta página lista o que ele encontrou e
**como o plano em [`02-arquitetura.md`](02-arquitetura.md) já responde** a cada ponto — mais os
riscos residuais que continuam sendo seus para vigiar (no espírito do artigo: *"verificação
continua sendo sua"*).

---

## A) Cobertura dos requisitos (nota do crítico)

| Requisito | Nota | Situação |
|---|---|---|
| (1) Pipeline tarefa→…→Deploy | 9/10 | Máquina de 11 estados mapeia 1:1. "Aprovação" foi reinterpretada como gate-de-spec do Crivo (defensável, mas é reinterpretação — ver risco R1). |
| (2) Quase sem humano | 8/10 | 1 porta obrigatória (PR) + 1 opcional + exceção. Risco real: taxa de HALT (R2). |
| (3) Dashboard simples | 7/10 → **resolvido** | Contradição CDN×offline corrigida: **HTML+CSS inline puro, sem Chart.js** (R3). |
| (4) MCP de banco | 9/10 | Melhor componente. Fronteira real = role SELECT-only + réplica. Depende de infra (R6). |
| (5) Spec-driven | 9/10 | Variante leve do delta OpenSpec; tags `verify:` evitam cobertura falsa. |
| (6) Fidelidade Loop Engineering | 9/10 | 5 blocos + memória honrados; worktree/heartbeat vêm de fora do kit (adição declarada). |
| (7) Fidelidade Nexus | 7/10 | Catálogo 1:1 e `gated()` reusados; 3 extensões de charter **declaradas** (R1). |
| (8) Segurança autônoma | 8/10 | Camada mais honesta; janela de insegurança nas fases 1–4 (R4). |

---

## A.1) Atualização de design (2026-06-29) — Executar primeiro + Preview

A pedido do usuário, o pipeline foi **reordenado** em duas fases: **(1) Executar** a tarefa
(resultado funcional mínimo) e **mostrar o preview** do resultado (screenshot + URL viva, no
dashboard) → **(2) Polir** (arquitetura, testes/lint/ts, segurança, code-review, limpeza). A
**aprovação do preview** vira uma porta humana **leve e cedo** (auto para mudanças sem superfície
visual). Razão: validar a **intenção** antes de gastar esforço polindo algo que pode estar errado.
Isso adiciona um toque humano deliberado (o usuário pediu) — não contradiz o "quase sem humano":
o grosso da mecânica segue automático; o humano concentra-se em "é o resultado certo?" (preview) e
"é seguro mergear?" (PR). Detalhe em [`02-arquitetura.md`](02-arquitetura.md) §3 e §3.1.

## B) Ajustes já incorporados ao plano

1. **Dashboard 100% self-contained.** Removidos CDN/Tailwind/Chart.js. HTML+CSS inline puro;
   métricas viram CSS/`<progress>`. → [`02`](02-arquitetura.md) §6.
2. **Card com dois tamanhos.** Mínimo p/ `risk:low`, completo só p/ `risk:high`. → §1.
3. **Relauncher long-run fora da v1.** O heartbeat é stateless e re-lê os cards; o `--resume` só
   entra se houver um heartbeat genuinamente longo atravessando reset de quota. → §2-A.
4. **`spec-validate` fundido em `/spec`.** Uma skill a menos. → §8.
5. **`BOARD.jsonl` cortado.** O dashboard lê os cards direto; não havia outro consumidor. → §8.
6. **Corvinus→card-de-rollback adiado.** Rollback fica no `deploy.yml` (health-check nativo) até
   o fluxo base estar provado. → [`04`](04-roadmap.md) Fase 5.
7. **Calibragem do Crivo por risco** com meta de taxa-de-passagem. → §3.
8. **Fallback de banco sem infra:** `verify: sql` → `verify: test`. → §5.
9. **Gate de segurança explícito:** proibido 24/7 desacompanhado antes do sandbox. → §7 / Fase 5.

---

## C) Riscos residuais (seus, para vigiar)

### R1 — "Usa peças do Nexus", não "roda o Nexus"
O hicode estende o charter do Crivo (gate de spec + diff), substitui o `CONFIRM` humano e gateia o
Vitro. São decisões **defensáveis e declaradas**, mas somadas significam fidelidade **ao catálogo
e ao gate**, menos ao protocolo `/nexus`. *Mitigação:* o `/nexus` interativo fica intacto para
trabalho manual; as extensões são escritas no system prompt do Crivo (D5), não improvisadas.

### R2 — Taxa de HALT vs "quase sem humano"
Um Crivo rigoroso ("assume nada correto até verificar") pode bloquear muitos cards 2× → muitos
`HALTED` → você destrava fila vermelha o dia todo, furando o "quase sem humano". *Mitigação:*
calibragem risco→rigor + meta de taxa-de-passagem monitorada no dashboard. **Risco real a medir
nas Fases 1–2** — não dá para garantir a taxa antes de rodar.

### R3 — Teatro de revisão no PR
O artigo exige "verificação continua sendo sua". Entregar um dossiê bonito + perguntas do Crivo
**ajuda**, mas não garante que você leia o diff. *Mitigação:* convenção de responder às perguntas
do Crivo **antes** de mergear; considerar exigir aprovação ligada a trechos do diff, não só ao
corpo do PR. **Disciplina humana, não automatizável.**

### R4 — Janela de insegurança nas Fases 1–4
A fronteira real (container + egress restrito) só chega na Fase 5, mas o heartbeat já roda na
Fase 2. *Mitigação:* nas Fases 1–4 o loop roda **supervisionado** (gate explícito: 24/7
desacompanhado só pós-sandbox). Aceite consciente: até a Fase 5, `cwd-guard`+denylist são guardas
fracas, adequadas só sob supervisão.

### R5 — Autoridade do `CLAUDE.md` (global × projeto)
O kit roteia pelo **global** `~/.claude/CLAUDE.md` (e o `block-comments` é global). O plano declara
o `CLAUDE.md` do projeto como autoridade. *A reconciliar na Fase 0:* ou o roteamento Nexus migra
para o projeto (garantindo que sobrepõe o global), ou deixamos claro que projeto **complementa** o
global. Decisão pequena, mas tem que ser tomada para não dar instrução conflitante ao agente.

### R6 — Staging efêmero / réplica pressupõem infra
A verificação de banco pré-PR depende de um banco staging descartável no CI, e a pós-deploy de uma
prod-replica. Muitos projetos não têm. *Mitigação:* fallback `verify: sql` → `verify: test`
declarado; confirmar a infra real do alvo na D2.

### R7 — Identidade do commit autônomo e conflito de merge
O fluxo abre PR via `gh pr create` headless. Falta definir: **quem assina o commit** (autor-bot?),
como a branch protegida concilia com um autor automatizado, e o **conflito de merge** quando vários
cards tocam arquivos vizinhos (worktrees isolam o checkout, **não** resolvem conflito na `main`).
*A resolver antes da Fase 2* (quando vários cards passam a correr em paralelo): identidade de bot
dedicada + estratégia de rebase/serialização de merges.

---

## D) O que explicitamente **não** vai existir na v1 (cortes conscientes)

- Relauncher long-run com `--resume` e endpoint OAuth não-oficial de quota.
- `BOARD.jsonl` como artefato separado.
- RCA automática do Corvinus criando card de rollback.
- Adoção do pacote `@fission-ai/openspec` ou do GitHub Spec Kit (só o **formato** delta é copiado).
- Qualquer auto-`deploy` de produção sem a porta humana (Environment approval).

---

## E) A linha que não cruzamos

> *Build the loop. Stay the engineer.*

O hicode automatiza a **mecânica** (descoberta, implementação, teste, segurança, review, abertura
de PR, deploy de staging). Ele **não** automatiza o **julgamento**: o merge é seu, as perguntas do
Crivo forçam sua leitura, e o disjuntor `HALTED` existe para parar o loop quando ele erra
desacompanhado. A meta é mover o seu trabalho de "promptar" para "desenhar e revisar o loop" — não
remover você dele.

Volta ao começo: [`00-resumo-executivo.md`](00-resumo-executivo.md).
