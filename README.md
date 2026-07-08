# hicode

Gerenciador de projetos **autônomo** para desenvolvimento com IA. Funde **Loop Engineering**
(você desenha o loop que prompta os agentes, em vez de promptar você mesmo) com o framework
**Nexus** (15 agentes de escopo estreito + o gate adversarial **Crivo**).

> **Você não prompta os agentes — você desenha o loop que os prompta.** Cada unidade de trabalho é
> um **card** em disco (a fonte de verdade); o **motor** roda o pipeline de agentes por card, mostra
> o **preview** do resultado, fecha o ciclo verde lendo **exit codes reais do disco**, e abre o
> **PR**. *O repo lembra; a conversa esquece.*

O hicode é o **plano de controle**: ele roda na raiz deste repo e gerencia **outros repositórios**
(os produtos-alvo) via worktrees. O painel Nuxt (`panel/`) é secundário — uma superfície de teste.
**Merge é SEMPRE humano:** o motor termina em `PR_OPEN` e para.

---

## Como rodar

O motor é controlado pelo CLI global **`hicode`** (registrado com `bun link`):

```bash
bun install          # dependências do motor (raiz)
bun link             # registra o binário `hicode` no PATH (~/.bun/bin)

hicode start         # sobe o daemon do motor
hicode status        # daemon online? + board de progresso dos cards
hicode watch         # progresso dos cards ao vivo
hicode stop | restart
hicode run           # motor em foreground (não daemoniza)
hicode once          # processa a fila uma vez e sai
hicode sync          # sincroniza tarefas externas (ver Pluggabilidade)
hicode init [caminho] # provisiona .hicode/ num repo-alvo (default: cwd)
hicode hooks install [caminho]   # instala o gate de pre-push num repo (default: cwd)
hicode hooks uninstall [caminho] # remove o pre-push
```

O painel (opcional, para testar/visualizar):

```bash
bun run panel        # Nuxt em http://localhost:4318
```

Suíte de qualidade do próprio hicode:

```bash
bun run test         # tsc --noEmit + lint no-any + testes (bun test) + typecheck do painel
bun run test:unit    # só os testes unitários
```

---

## Pipeline — executar primeiro, polir depois

```
Fase 1 (EXECUTAR):  [spec opcional] → executar → PREVIEW (você vê) → aprovar/recusar
Fase 2 (POLIR):     arquitetura → testes → segurança → review → limpeza
                    → PR (humano) → merge (humano)
```

A porta humana obrigatória é o **merge do PR**. A **aprovação do preview** é uma porta leve e cedo
(recusar volta o card para correção com o motivo). A verificação visual do preview é **feita por
código** (Playwright abre o `dev` e captura a tela); a análise por IA é **opcional**
(`HICODE_VISUAL_AI=off` desliga — screenshot + aceite humano, sem token de IA).

**Máquina de estados** (frontmatter `status` do card):

```
INBOX → READY → [SPECCED → PLAN_APPROVED] → EXECUTING → EXECUTED → PREVIEW
      → (CORRECTING) → PREVIEW_OK → REFINED → TESTS_GREEN → SEC_CLEARED
      → REVIEWED → CLEANED → PR_OPEN → MERGED → DEPLOYED     (HALTED / PAUSED)
```

Cada transição é carimbada pelo motor lendo **exit code real em disco** (build/test/gate), nunca
pela fala do modelo.

### Steps configuráveis

A fase de polimento é **dados**, não código: `config/pipeline.json` (override por projeto em
`<alvo>/.hicode/pipeline.json`). Cada step pode ser **ativado/desativado, reordenado e customizado**
— lido do disco, **0 token** ao modelo.

```json
{
  "id": "arquitetura", "label": "Arquitetura", "kind": "quality",
  "agent": "rufus", "state": "REFINED",
  "gate": "none",        // none | test | verdict
  "enabled": true,
  "gated": true,         // se true, passa pelo Crivo antes de "pronto"
  "instruction": "..."   // %s = objetivo do card
}
```

### Gates reais

- **Visual** — screenshot (Playwright) obrigatório; distingue *falhou* de *inconclusivo* (nunca
  aprova por omissão). IA opcional via `HICODE_VISUAL_AI`.
- **Teste** (`gate: "test"`) — roda `npm test` no worktree com exit-code + reajuste.
- **Gated Nexus** (`gated: true`) — o padrão do Nexus no motor: **agente → Crivo revisa o diff →
  se BLOCKED, reexecuta com o motivo (retry) → se persistir, HALT**. Determinístico e por
  subprocesso (mantém multi-provedor).
- **Codefox** — gate adversarial final sobre o diff acumulado, antes do PR (só `BLOCKED` bloqueia).
- **Spec (OpenSpec)** — `openspec validate --strict --json` como gate determinístico da fase de spec.

---

## IA multi-provedor

As chamadas de IA passam pela interface `AiProvider` (`lib/ai/`); um registry escolhe o provedor
**por papel** via env. Trocar de IA não toca no motor.

| Provedor | Edita arquivos | Custo/tokens | Papel indicado | Status |
|---|---|---|---|---|
| **claude** | sim | $ + tokens | qualquer (default) | verificado |
| **ollama** | não¹ | 0 / tokens | verify, gate (local, barato) | verificado ao vivo |
| **codex** | sim | tokens (sem $) | implement, step | pronto (requer CLI + auth) |
| **opencode** | sim | $ + tokens | implement, step | pronto (requer CLI + auth) |

¹ Ollama sozinho não edita arquivos (sem loop de tools). Para **implementar com Ollama**, use-o via
OpenCode: `HICODE_IMPLEMENT_PROVIDER=opencode` + `HICODE_OPENCODE_MODEL=ollama/<modelo>`.

**Seleção por papel** (default global + overrides):

```bash
HICODE_AI_PROVIDER=claude          # default de todos os papéis
HICODE_IMPLEMENT_PROVIDER=codex    # override por papel: implement | verify | gate | step
HICODE_VERIFY_PROVIDER=ollama
HICODE_GATE_PROVIDER=claude
```

---

## Pluggabilidade

### Plugável em qualquer repo (sem apagar a memória do alvo)

`hicode init <repo>` cria **apenas** uma pasta `.hicode/` no repo-alvo — **aditiva e não-destrutiva**
(nunca toca no `.claude/`, `CLAUDE.md` ou memória do próprio repo).

```
<repo-alvo>/.hicode/
├── config.json     provider de IA, base branch, task-source do projeto
├── rules.md        regras do projeto p/ o motor (aditivas ao CLAUDE.md; injetadas no prompt)
├── pipeline.json   override dos steps deste projeto
├── memory/         o que o hicode aprendeu sobre o projeto
├── skills/         skills criadas para o projeto
└── state/          runs/previews derivados (gitignorável)
```

### Plugável em ferramentas de tarefas (o card continua a espinha)

Plugins de **sync** (`lib/tasks/`) importam tarefas externas → cards e espelham estado/PR de volta.
O **painel Nuxt é o plugin local de referência**. Adapter incluído: **GitHub Issues**.

```bash
HICODE_TASK_SYNC=github-issues HICODE_GH_REPO=owner/repo hicode sync
```

---

## Configuração (variáveis de ambiente)

| Var | Default | O quê |
|---|---|---|
| `HICODE_AI_PROVIDER` | `claude` | provedor default |
| `HICODE_{IMPLEMENT,VERIFY,GATE,STEP}_PROVIDER` | — | override por papel |
| `HICODE_VERIFY_MODEL` / `HICODE_GATE_MODEL` | `sonnet` | modelo (claude) de verify/gate |
| `HICODE_CODEX_MODEL` / `HICODE_OPENCODE_MODEL` / `HICODE_OLLAMA_MODEL` | — | modelo por provedor |
| `HICODE_OLLAMA_URL` | `http://localhost:11434` | endpoint do Ollama |
| `HICODE_VISUAL_AI` | `on` | `off` desliga o check visual por IA (só screenshot + humano) |
| `HICODE_TASK_SYNC` | `none` | plugin de sync de tarefas (`github-issues`) |
| `HICODE_GH_REPO` | — | repo do adapter GitHub Issues |
| `HICODE_CONCURRENCY` | `3` | cards em paralelo |
| `HICODE_POLL_MS` | `5000` | intervalo do tick |
| `HICODE_RUN_TIMEOUT_MS` | `300000` | timeout por chamada de IA |
| `HICODE_PREVIEW_BASE` | `5200` | porta base dos previews |
| `HICODE_{VERIFY,REAJUSTE,CONFLICT}_RETRIES` | `1`/`2`/`2` | retries |
| `HICODE_GATE_DIFF_LIMIT` | `60000` | corte do diff enviado ao gate |

---

## Estrutura

```
runner.ts              entrypoint do processo do daemon (bun runner.ts)
bin/hicode.ts          CLI global `hicode` (start/stop/status/watch/run/once/sync/init)
lib/ai/                provider de IA: types · usage · registry · adapters/{claude,codex,opencode,ollama}
lib/runner/            motor: queue · execute · finish · correct · merge · spec-phase · gated
  pipeline/            steps configuráveis (types + config)
  progress.ts          board de progresso no terminal
  hicode-home.ts       resolve/provisiona o .hicode/ do alvo
  hooks.ts             instala/remove o pre-push (hicode hooks install)
  codefox-gate.ts      gate adversarial Crivo (por-step e final)
lib/spec/openspec.ts   wrapper do OpenSpec (init/validate como gate determinístico)
lib/tasks/             plugin de sync de tarefas (interface + registry + adapters/github-issues)
lib/card/              domínio do card (frontmatter, tipos, helpers puros)
config/pipeline.json   steps default (editável, 0 token)
config/repos.json      repos-alvo geridos
cards/                 cards (<NNN>.md) + runs/*.json + previews/  — dados
scripts/               runner-daemon.sh (daemonização/PID) · check-no-any.mjs
  hooks/pre-push       gate de pre-push determinístico e portátil (versionado)
test/                  testes (bun test)
.github/workflows/     ci.yml (typecheck + lint + testes)
panel/                 painel Nuxt (secundário, teste) — plugin local de referência
plano/                 o plano do projeto (00..05)
.claude/               agentes Nexus, skills, hooks
```

---

## Qualidade & convenções

- **Tudo tipado strict**: proibido `any`/`unknown` (hook `block-any-unknown`); toda função com tipo
  de retorno.
- **Sem comentário de prosa** no código (Clean Code — hook `block-comments`); extraia para nomes.
- **Arquivo ≤ 350 linhas** e nunca god-file (hook `block-monolithic`).
- **Merge sempre humano**: proibido `gh pr merge` no código; o fluxo para em `PR_OPEN`.
- **Testes**: `bun test ./test` (unidades puras); **CI** em `.github/workflows/ci.yml` roda
  typecheck + lint + testes em PRs para `main`.
- **Gate de pre-push**: hook **determinístico e portátil** (`scripts/hooks/pre-push` — detecta o
  package manager e roda `test`/`typecheck`/`lint`), instalável em qualquer repo com
  `hicode hooks install`. A **revisão adversarial (codefox)** fica no **PR** via `/pre-review`. O
  motor pusha com `--no-verify` (ele já se auto-gateia). Pular o hook: `git push --no-verify` ou
  `SKIP_HOOK=1 git push`.

## Plano

O plano completo está em [`plano/`](plano/): resumo executivo, análise de metodologias, arquitetura,
decisões, roadmap e riscos.
