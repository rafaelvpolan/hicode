# 01 — Análise das Duas Metodologias

Antes de propor o hicode, esta é a leitura profunda das duas fontes e de onde elas se
encontram. O hicode é a fusão delas.

---

## A) Loop Engineering (`METODOLOGIA.md`)

**Tese central.** Por ~2 anos, trabalhar com agente de código era: você escreve um bom prompt,
lê o que volta, escreve o próximo. Você segurava a ferramenta o tempo todo. Loop engineering
move o ponto de alavanca: **você para de promptar o agente e passa a desenhar o sistema que o
prompta**. Citado no artigo — Steipete: *"You shouldn't be prompting coding agents anymore.
You should be designing loops that prompt your agents."*; bcherny (Claude Code/Anthropic):
*"I don't prompt Claude anymore. I have loops running that prompt Claude... My job is to write loops."*

**Os 5 blocos + a memória.** O insight do artigo é que isso deixou de ser "um monte de bash que
só é seu" — as peças hoje vêm dentro dos produtos (Claude Code e Codex têm as cinco):

| Bloco | O que é | No Claude Code |
|---|---|---|
| **1. Automações** (o batimento) | Disparam por agenda e fazem discovery/triagem sozinhas | `/loop` (cadência), `/goal` (até condição verificável), cron, hooks, GitHub Actions |
| **2. Worktrees** | Isolamento de checkout p/ paralelismo sem colisão | `git worktree`, flag `--worktree`, `isolation: worktree` em subagente |
| **3. Skills** | Conhecimento do projeto escrito em disco | `.claude/skills/<nome>/SKILL.md` |
| **4. Plugins/conectores** | O loop toca ferramentas reais (issues, banco, staging, Slack) | MCP via `.mcp.json` |
| **5. Sub-agentes** | Separar **quem faz** de **quem checa** (maker/checker) | `.claude/agents/*.md`, agent teams |
| **+ Memória** | Markdown/board que vive fora da conversa, guarda o feito e o próximo | arquivo em disco / Linear |

**A forma de um loop** (citada quase literalmente do artigo): uma automação roda toda manhã →
uma skill de triagem lê falhas de CI, issues abertas e commits recentes → escreve os achados num
arquivo de estado → para cada achado que vale, abre um worktree e manda um sub-agente rascunhar
o fix, e um segundo sub-agente revisa contra as specs e os testes → conectores abrem o PR e
atualizam o ticket → o que o loop não dá conta cai numa inbox de triagem para você. **O arquivo
de estado é a espinha** — "o modelo esquece tudo entre as rodadas, então a memória tem que estar
no disco, não no contexto. O agente esquece, o repo não."

**As três cautelas (que o hicode tem que respeitar):**

1. **Verificação continua sendo sua.** "Um loop rodando desacompanhado é também um loop errando
   desacompanhado." 'Pronto' é uma alegação, não uma prova.
2. **Dívida de compreensão.** Quanto mais rápido o loop entrega código que você não escreveu,
   maior o buraco entre o que existe e o que você entende — *a menos que você leia o que o loop fez*.
3. **Rendição cognitiva.** A postura confortável (pegar o que o loop devolve sem ter opinião) é a
   arriscada. *"Build the loop. Stay the engineer."*

> **Como o hicode honra isso:** estado em disco = o **card**; maker/checker = agente **gated** →
> **Crivo**; o critério de "pronto" não é a fala do modelo, é o **exit code em disco**; e o PR
> traz **perguntas do Crivo** justamente para forçar leitura humana (contra a rendição cognitiva).

---

## B) Framework Nexus (`prompter-main/`)

Uma implementação concreta de boa parte do que o artigo descreve. Componentes:

### 1. Catálogo de 15 agentes (escopo estreito = prompt afiado = menos alucinação/echo)

| Agente | Modelo | Gated? | Domínio |
|---|---|---|---|
| **limpio** | sonnet | ✅ | Clean code, SOLID, TDD, features |
| **escudo** | sonnet | ✅ | Segurança: OWASP, secrets, auth, CVE, IaC |
| **testudo** | sonnet | ✅ | Testes: cobertura, mutation, performance |
| **rufus** | opus | ✅ | Refactor seguro sem mudar comportamento |
| **radix** | sonnet | ✅ | Banco/dados: schema, migrations, índices, queries |
| **celer** | sonnet | ✅ | Performance (mede antes/depois) |
| **crivo** | opus | — (é o gate) | Revisão adversarial; veredito vinculante; read-only |
| **quaero** | sonnet | ❌ | Pesquisa externa (libs, RFCs, trade-offs) |
| **pluto** | sonnet | ❌ | Dead-code (sinaliza, não deleta) |
| **vitro** | sonnet | ❌ | Frontend (React/RN/Solid) |
| **corvinus** | opus | ❌ | Observabilidade, logs, métricas, RCA |
| **glossia** | haiku | ❌ | Documentação (.md, ADR, OpenAPI, Mermaid) |
| **fulgor** | sonnet | ❌ | Dashboards/apresentações `.html` single-file |
| **continuum** | sonnet | ❌ | CI/CD, IaC, deploy (**gera, nunca aplica**) |
| **pura** | haiku | ❌ | Remove comentários |

"**gated**" = o trabalho passa **obrigatoriamente pelo Crivo** antes de ser considerado pronto.

### 2. Crivo — o gate adversarial (a peça-chave)

Roda **depois** de um agente gated. Socrático, sem lealdade ao agente revisado: lê o código, o
git e os arquivos relacionados de forma **independente** (não confia no resumo). Avalia design,
bugs/edge-cases, qualidade de teste, segurança, simplicidade e a coerência entre o que o agente
disse e o que o diff mostra. **Veredito vinculante:** `APPROVED` / `CONDITIONAL` / `BLOCKED`.
É o maker/checker do artigo, mecanizado.

### 3. `/nexus` — o orquestrador (5 fases)

`ANALYZE → PLAN → CONFIRM(humano) → EXECUTE(via Workflow tool) → REPORT`. O motor de execução é
o helper **`gated()`**: roda o agente, roda o Crivo; se `BLOCKED`, re-roda com o feedback (até 2×);
se persistir, **HALT** no ramo. Agentes independentes correm em `parallel()`.

### 4. Modo long-run autônomo

Sessões de ~5h; um hook `PreToolUse` bloqueia tools aos 90% de quota (heurística, **falha
aberto** se o status estiver velho); memória de checkpoint em `~/.claude/longrun-memory.md`; um
relauncher externo (cron) detecta o reset e roda `claude --resume`. **Denylist** obrigatória
(`rm -rf`, `git push --force`, `npm publish`, `DROP`...), permissão `acceptEdits` (nunca
`bypassPermissions`).

### 5. Filosofia Clean Code

Sem comentários de prosa em código — imposto deterministicamente pelo hook `block-comments.mjs`.

---

## C) Onde as duas se encontram (e onde divergem)

| Bloco do artigo | Peça do Nexus | Lacuna que o hicode preenche |
|---|---|---|
| Automações/heartbeat | — (Nexus é sob demanda) | **cron/Actions stateless** disparando a triagem |
| Worktrees | `isolation: worktree` existe, mas o kit não usa | **worktree por card** + `cwd-guard` |
| Skills | skills do kit | `hicode-triage`, `hicode-run-card`, `/spec` |
| Conectores MCP | citado, mas **não há `.mcp.json` no kit** | **MCP de banco read-only** (verificador) |
| Sub-agentes maker/checker | `gated()` + Crivo ✅ | reusado integralmente |
| Memória em disco | `longrun-memory.md` | o **card** como espinha; longrun vira só ponteiro |

**Divergências honestas** (o hicode estende o charter do Nexus, e isso é declarado, não fingido):

- O Crivo é charterizado **só** para revisar a saída dos 6 agentes gated. O hicode também o usa
  como **gate de spec** (estado 2) e **code-review do diff completo** (estado 6) → exige
  **estender** o `crivo.md` (decisão explícita em [`03-decisoes.md`](03-decisoes.md)).
- O `/nexus` tem `CONFIRM` humano marcado como *NEVER skip*. No modo autônomo do hicode, o
  `CONFIRM` é **substituído** pelo gate Crivo sobre o plano + a porta do PR. É um desvio
  **declarado** — o `/nexus` interativo continua disponível para trabalho manual.
- Vitro é não-gated no kit; o hicode o gateia (frontend que toca contrato/segurança merece gate).

> **Conclusão:** o hicode não "roda o `/nexus`". Ele **usa peças do Nexus** (catálogo + `gated()`
> + Crivo) dentro de um orquestrador novo, voltado para o loop autônomo do artigo, com spec-driven
> leve e verificação de banco. A fidelidade é **ao catálogo de agentes e ao gate**, menos ao
> protocolo interativo `/nexus`.

Próximo: [`02-arquitetura.md`](02-arquitetura.md).
