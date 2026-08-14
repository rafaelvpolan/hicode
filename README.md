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

```bash
bun install          # dependências do motor (raiz)
bun link             # registra os binários `hii` e `hicode` no PATH (~/.bun/bin)
```

### `hii` — a sessão interativa (porta canônica)

`hii` **sem argumento** abre a sessão. É onde se cria tarefa, responde pergunta, lê o plano e
aprova — tudo no terminal:

```
$ hii

  hicode — motor de tarefas   /help para os comandos

hicode · org/app   daemon online (pid 48213)
2 ativo(s) · 1 esperando voce

  #039 ████··  polir   #041 ██····  executar

› FAQ acordeão acessível na home        ← texto livre cria o card e mostra o plano
› ⏎                                     ← enter aprova o plano e enfileira
› /board                                ← quadro completo da frota
```

| Comando | O quê |
|---|---|
| *texto livre* | cria o card e **mostra o plano**; nada executa antes da aprovação |
| `⏎` (enter) | aprova o plano pendente e enfileira |
| `/board` | **quadro do projeto AO VIVO** — tela cheia, atualiza sozinho, `q` volta |
| `/cards [STATUS]` | lista, opcionalmente filtrando (`/cards HALTED`) |
| `/plan <id>` | reexibe o plano de um card |
| `/watch <id>` | últimas transições do card + link do preview |
| `/agents <id>` | **agentes, skills e ferramentas** que rodaram no card |
| **`/ok <id>`** | **aprova o preview que você viu no dev server** |
| **`/no <id> [o que]`** | rejeita o preview; com motivo, pede correção em vez de refazer |
| `/halt <id> [motivo]` | para um card |
| `/repo` | troca de projeto (reabre a lista); `/repo <nome>` vai direto |
| `20` ou `#20` | mostra o plano do card 20 — **número puro consulta, não cria tarefa** |
| `/quit` | sai — **não** derruba o daemon nem os cards |

Com mais de um projeto registrado, a sessão **abre pela lista de projetos** — com quantos cards
cada um tem, quantos esperam você, quantos rodam e quantos pararam. Você entra em um e tudo depois
disso é **escopado a ele**: board, `/cards`, a faixa da frota. Com um projeto só, entra direto.

**Colar funciona** — link, texto ou bloco inteiro. Colagem grande vira um marcador compacto
(`[colado #1 · 47 linhas]`) e só expande no envio, então o input não vira uma parede de texto.

Duas garantias de desenho:

- **O REPL é cliente, nunca um segundo motor.** Ele não processa a fila e não chama IA: pede o
  plano ao core, que é determinístico (0 token). Dois processos na mesma fila é o furo que o
  lock de instância existe para impedir.
- **Sair não derruba trabalho.** `/quit` e `ctrl+D` encerram a sessão; os cards seguem no daemon.
  Para parar um card, `/halt`.

Se o daemon estiver offline ao abrir a sessão, ele **pergunta uma vez** se deve subir — e aceita
`sempre`/`nunca`, gravando a preferência em `cards/runs/.repl.json`. Sem TTY (pipe, CI) não
pergunta: avisa e segue.

### `hii <comando>` — modo script e CI

```bash
hii start            # sobe o daemon do motor
hii status           # daemon online? + board de progresso dos cards
hii watch            # progresso dos cards ao vivo
hii stop | restart
hii run              # motor em foreground (não daemoniza)
hii once             # processa a fila uma vez e sai
hii sync             # sincroniza tarefas externas (ver Pluggabilidade)
hii approve <id>     # aprova o preview (PREVIEW -> PREVIEW_OK)
hii approve <id> --plan   # aprova o plano e enfileira (READY -> EXECUTING)
hii reject <id> [o que]   # rejeita o preview; com motivo, pede correção
hii halt <id> [motivo]    # para o card
hii doctor           # confere gh, IA, daemon, push e contrato — ANTES de gastar token
hii archive          # arquiva os entregues acima do teto (10 por projeto)
hii archive ls       # o que está arquivado
hii archive restore <id>   # traz um card de volta
hii init [caminho]   # provisiona .hii/ num repo-alvo (default: cwd)
hii hooks install [caminho]   # instala o gate de pre-push num repo (default: cwd)
hii hooks uninstall [caminho] # remove o pre-push
```

`hicode` continua valendo como alias de `hii`.

O painel (opcional, para visualizar e revisar diff):

```bash
bun run panel        # Nuxt em http://localhost:4318
```

Suíte de qualidade do próprio hicode:

```bash
bun run test         # tsc --noEmit + lint no-any + testes (bun test) + typecheck do painel
bun run test:unit    # só os testes unitários
```

> O `typecheck:panel` exige as dependências do painel instaladas (`cd panel && bun install`).
> Sem elas o comando falha com `nuxt: command not found` — e **não** é um typecheck que passou.

---

## Primeiros passos — do zero à primeira tarefa

> **`hii init` é só o passo 0.** Ele provisiona a pasta `.hii/` no repo-alvo e **para por
> aí** — **não** cria tarefas, **não** sobe o motor e **não** registra o repo. "Iniciar as
> tarefas" são os passos abaixo.

### Passo 1 — Provisionar o repo-alvo

```bash
hii init /caminho/do/repo-alvo   # cria .hii/ (aditivo, nunca toca no repo)
```

Cria `.hii/{config.json, rules.md, pipeline.json?, memory/, skills/, state/}`. Edite
`.hii/rules.md` (curto: stack, convenções, o que nunca mexer) — ele é injetado no prompt de
cada card.

### Passo 2 — Registrar o repo-alvo no motor

Pelo CLI — **determinístico, 0 token**:

```bash
hii repo add owner/repo-alvo --path /caminho/do/clone
hii repo ls          # estado de cada alvo (clone ok? contrato gerado?)
hii repo rm owner/repo-alvo
```

Sem `--path`, procura o clone **irmão** deste repo (`../<nome>`). O `add` faz tudo numa passada:

1. **valida** que o clone existe e é um repositório git — falha aqui, não depois em `HALTED`;
2. **detecta a branch base** pelo próprio git (`origin/HEAD`, senão a branch atual);
3. **provisiona `.hii/`** no alvo (o mesmo que `hii init`);
4. **gera o contrato** — stack, gerenciador de pacotes, comandos e pacotes do alvo.

O registro é **configuração de máquina**, então `config/repos.json` **não é versionado**
(`config/repos.example.json` é o modelo). Editar à mão continua valendo:

```json
[
  {
    "name": "owner/repo-alvo",
    "path": "/caminho/absoluto/do/clone-local",
    "branch": "main"
  }
]
```

- `name` — precisa **bater** com o campo `repo:` dos cards.
- `path` — clone local. **Se omitir**, o motor procura um diretório **irmão** deste repo com o
  basename de `name` (ex.: `../repo-alvo`).
- `branch` — base branch do alvo (default `main`).

> Sem um `path` válido (nem irmão), o card vai para `HALTED` com `repo nao encontrado`.
> A sessão `hii` **avisa na abertura** quando o registro está vazio, quando o repo da sessão não
> está registrado, ou quando o `path` aponta para um clone que não existe — antes de você gastar
> uma execução para descobrir.

Para apontar o registro para outro lugar (ex.: perfis por máquina), use `HICODE_REPOS_FILE`.

### Passo 2b — O contrato do alvo (detecção determinística, 0 token)

`hii repo add` já gera; para redetectar depois de mudar dependências:

```bash
hii contract /caminho/do/alvo     # escreve <alvo>/.hii/contract.json
hii contract /caminho --json      # a estrutura crua
```

O que ele descobre **sem gastar um token** — lendo lockfile, `package.json`, `tsconfig` e configs:

| Campo | De onde sai |
|---|---|
| `packageManager` | lockfile (`bun.lock` › `pnpm-lock.yaml` › `yarn.lock` › `package-lock.json`) |
| `shape` | `single` · `workspaces` (globs de workspace) · `poly` (projetos irmãos sem raiz comum) |
| `packages[]` | nome, caminho, framework, linguagem, **gerenciador próprio**, scripts, porta de dev |
| `commands` | build/test/lint/typecheck/dev **derivados dos scripts que existem** — script ausente vira comando vazio, nunca um chute |
| `stack` | a frase que vai no prompt (ex.: `Vite + Vue 3 + TypeScript (pnpm)`) |
| `hash` | das fontes — regenera só quando elas mudam |

O `poly` cobre a forma "pasta com vários projetos independentes, cada um com seu gerenciador" —
onde nenhum comando fixo funcionaria.

`contract.json` é **derivado e gitignorado** no alvo (regenera em menos de 1s); o que fica
versionado lá é `.hii/rules.md` e `.hii/config.json`.

> **Por que isso importa para o custo:** antes, o prompt afirmava um stack fixo. Num alvo que não
> batia, a IA escrevia código errado e o motor pagava reajuste para consertar. Detectar é grátis;
> adivinhar é caro.

### Passo 2c — `hii doctor` (antes de gastar o primeiro token)

```bash
hii doctor
```

Confere, de forma determinística: `gh` instalado e autenticado · CLIs de IA dos papéis em uso ·
daemon · **se o `git push` autentica de verdade** · contrato de cada alvo. Sai com código 1 se
houver erro, então serve em CI.

O check de push **não** é `git ls-remote`: em repo público a leitura passa sem credencial e daria
um "ok" falso. É `git push --dry-run`, que autentica sem escrever nada.

> **Por que existe:** um card real rodou implementação, polimento, build, sync, revalidação e
> gate — e morreu no `git push` por falta de credencial. Custo do que foi jogado fora: **US$ 1,71**.
> O `doctor` detecta isso em 1 segundo, e o motor agora faz esse mesmo preflight **antes** da fase
> de polimento: se o push não vai funcionar, o card para sem gastar.

Conserto mais comum (git com remote HTTPS e sem credential helper):

```bash
gh auth setup-git    # faz o git usar o token que o gh já tem
```

### Passo 3 — Subir o motor

```bash
hii start        # daemon em background
hii status       # daemon on? + board dos cards
# alternativas: hii run (foreground) · hii once (processa a fila 1x e sai)
```

### Passo 4 — Criar os cards (as tarefas)

O **card** (`cards/<NNN-slug>.md`) é a tarefa. Ele nasce por um destes caminhos:

| Caminho | Comando / ação | Status inicial |
|---|---|---|
| **REPL** (recomendado) | `hii` → escrever a tarefa → ler o plano → `⏎` | `READY` → `EXECUTING` |
| **Painel** | `bun run panel` → criar card na UI | `READY` |
| **Sync externo** | `HICODE_TASK_SYNC=github-issues HICODE_GH_REPO=owner/repo hii sync` | `READY` |
| **Manual** | escrever `cards/<NNN-slug>.md` à mão | você define |

Todo card precisa do campo `repo:` batendo com o `name` do Passo 2 — no REPL isso vem do
`/repo` da sessão.

### Passo 5 — Iniciar o card (`READY → EXECUTING`)

> ⚠️ **Ponto de atenção:** o motor só consome cards em `SPECCED`, `EXECUTING`, `PREVIEW_OK` e
> `CORRECTING`. Ele **não** puxa `READY`/`INBOX` sozinho — um card recém-criado **fica parado**
> até ser promovido.

Três formas de promover:

- **REPL** — o `⏎` que aprova o plano já promove (`READY → EXECUTING`).
- **Painel** — botão **iniciar** no card.
- **Manual** — trocar o `status:` do card para `EXECUTING`.

A partir daí o motor roda o pipeline e **para no `PREVIEW`**, esperando você.

### Passo 5b — Aprovar o preview (a porta humana do meio)

O motor deixa o **dev server vivo** e o link no card. Você abre, olha, e decide:

| Onde | Aprovar | Rejeitar |
|---|---|---|
| **REPL** | `/ok <id>` | `/no <id> [o que corrigir]` |
| **CLI** | `hii approve <id>` | `hii reject <id> [o que]` |
| **Painel** | botão aprovar | botão recusar |

**Aprovar e rejeitar são guardados por estado:** só valem para card em `PREVIEW`. Aprovar um
card que já passou dessa fase é recusado com o motivo — antes isso reexecutava o trabalho e
pagava de novo.

Rejeitar **com motivo** e worktree válido pede **correção pontual** (`CORRECTING`); sem motivo,
refaz a implementação inteira. Dizer o que está errado é mais barato que só dizer "não".

Depois do `PREVIEW_OK` vem o polimento, e o motor **para em `PR_OPEN`** — o merge é sempre humano.

### Passo 6 — Acompanhar

```bash
hii                 # sessão: faixa da frota + /watch <id> + /board
hii watch           # board dos cards ao vivo no terminal (sem sessão)
bun run panel       # painel em http://localhost:4318 (preview, diffs, aprovar/recusar)
```

### Receita rápida (copiar e colar)

```bash
hii init /caminho/do/repo-alvo        # 1. provisiona .hii/ no alvo
#   ↳ registre o alvo em config/repos.json                    # 2. name/path/branch
hii start                             # 3. sobe o motor
hii                                   # 4. sessão: escreva a tarefa
#   ↳ leia o plano e tecle ⏎                                  # 5. aprova e enfileira
#   ↳ /watch <id> acompanha; /board mostra a frota            # 6. acompanhar
```

---

## Acompanhar a execução

**`/agents <id>`** lê o log de streaming da IA e mostra o que de fato rodou:

```
#021 — vitro, frontiteto · 1 skill(s) · 9 arquivo(s) · 2 comando(s)
  ◇ sessao claude-opus-5
  ◆ agente vitro — criar o selo no hero
  ✦ skill frontend-design
  · read src/App.vue
  · edit src/App.vue
  $ bash npm run build
  ◇ concluido US$0.4078
```

Sai de `cards/runs/<id>.live.log`, que o adapter de streaming grava com cada
`tool_use` — então **um `Task({"subagent_type":"vitro"})` é um agente Nexus sendo despachado**, e
`Skill(...)` é uma skill. Nada disso precisou de instrumentação nova: o dado já existia, faltava
ler.

> O log **acumula** por card (com poda automática acima de 1MB). Antes ele era truncado a cada
> chamada de IA, então ao entrar no polimento você perdia o registro da implementação.

### Teto de cards por projeto

Card entregue (`MERGED`/`DEPLOYED`) acima de **10 por projeto** vai para `cards/archive/` — o motor
poda sozinho no tick. Card vivo **nunca** é arquivado: `PR_OPEN` espera merge, `HALTED` espera
você, e em andamento é trabalho em curso. Se o teto estourar só com card vivo, o motor avisa em vez
de mexer.

---

## Pipeline — executar primeiro, polir depois

```
Fase 1 (EXECUTAR):  [spec opcional] → executar → PREVIEW (você vê) → aprovar/recusar
                    (tarefa não-visual pula o PREVIEW e segue direto — ver classificação prévia)
Fase 2 (POLIR):     arquitetura → testes → segurança → review → limpeza
                    → PR (humano) → merge (humano)
```

A porta humana obrigatória é o **merge do PR**. A **aprovação do preview** é uma porta leve e cedo
(recusar volta o card para correção com o motivo). A verificação do preview é o **humano abrindo o
link vivo** — o motor mantém o `dev` no ar (com **reset** que reinicia e limpa o cache do Vite) e só
detecta de forma **determinística** se o preview subiu quebrado (overlay de erro do Vite / erro de
console), sem julgar o resultado por IA. O **screenshot é oculto/sob demanda** (fallback). A análise
por IA é **opt-in** (`HICODE_VISUAL_AI=on`; default `off`, sem token de IA).

### Classificação prévia — visual vs. não-visual

Antes do preview, o motor faz uma **análise prévia do tipo de tarefa** (heurística
determinística, **0 token**) e grava `surface: visual|none` no frontmatter do card:

- **Visual** (página, hero, botão, cor, layout, menu, css…) → fluxo normal: sobe o `dev`, deixa o
  **link vivo** no ar e **para em `PREVIEW`** aguardando o aceite humano (screenshot sob demanda).
- **Não-visual** (corrigir conflitos, refactor, dependências, config, CI, testes, backend/api,
  migration, docs…) → **pula dev server + preview** e vai direto de `EXECUTED` para
  `PREVIEW_OK` (auto). Não há página pra mostrar — o humano ainda revisa no **PR**.
- **Ambíguo** (nenhum sinal) → assume **visual** (mostra o preview; default seguro, sem regressão).
- Repo **sem dev server** → sempre não-visual (nada a renderizar).

```
tarefa "Essa PR está com conflitos, corrija"  → surface: none    → pula o preview
tarefa "muda a cor do hero"                    → surface: visual  → screenshot + aprovar
tarefa "ajusta o fluxo de checkout" (ambíguo)  → surface: visual  → screenshot + aprovar
```

> **Override manual:** defina `surface: visual` (ou `none`) no frontmatter do card e a
> classificação automática é ignorada — o valor do card sempre vence. No painel, um card
> não-visual mostra o badge **`↷ não-visual`**.

**Máquina de estados** (frontmatter `status` do card):

```
INBOX → READY → [SPECCED → PLAN_APPROVED] → EXECUTING → EXECUTED → PREVIEW
      → (CORRECTING) → PREVIEW_OK → REFINED → TESTS_GREEN → SEC_CLEARED
      → REVIEWED → CLEANED → PR_OPEN → MERGED → DEPLOYED     (HALTED / PAUSED)

      EXECUTED → PREVIEW_OK direto quando surface: none (tarefa não-visual)
```

Cada transição é carimbada pelo motor lendo **exit code real em disco** (build/test/gate), nunca
pela fala do modelo.

### Recuperação & resiliência

O motor é um daemon reiniciável e os cards vivem em disco — nenhum estado se perde num restart.

**Reconcile no boot** (`reconcileStranded`) — ao subir, o daemon recupera cards presos por um
restart no meio do caminho:

| Estado ao reiniciar | Recuperação | Por quê |
|---|---|---|
| `REFINED` `TESTS_GREEN` `SEC_CLEARED` `REVIEWED` `CLEANED` | → `PREVIEW_OK` | o job de polimento reinicia do começo da fase |
| `EXECUTING` `CORRECTING` `SPECCED` | reexecutado | o job foi interrompido; a fila reprocessa |
| `EXECUTED` | → `EXECUTING` | estado transitório sem consumidor — um card só fica aqui se o preview não concluiu ou foi **rejeitado sem worktree**; reexecuta em vez de ficar órfão |

**Toda task parte da base ATUALIZADA — e falha se não conseguir.** `ensureWorktree` faz
`fetch origin/<base>`, **verifica o resultado** e cria a branch de `origin/<base>` recém-buscado.
Se o fetch falhar (rede, credencial), o card **para** em vez de nascer de estado velho — antes o
erro do fetch era descartado e a branch saía de um `origin/main` em cache, silenciosamente. O
commit de origem fica gravado no card (`base_commit`), então dá para auditar de onde a branch saiu.

Card com **spec** reaproveita o worktree; nesse caminho o motor faz `fetch` + integra o que a base
andou (`refreshFromBase`) antes de executar. Conflito na integração para o card com o motivo.

**Worktree idempotente** — `ensureWorktree` **nunca trava por sobra de estado**: roda
`git worktree prune`, remove o path-alvo (e apaga diretório-fantasma não-registrado), **remove
qualquer outro worktree que segure a mesma branch** e só então recria.

**Timeout & HALT** — cada chamada de IA é morta em `HICODE_RUN_TIMEOUT_MS` (default **15 min**)
com `SIGTERM`→`SIGKILL`; **no timeout o worktree é preservado** p/ inspeção/retomada. Um card em
`HALTED` precisa de resolução humana — no painel, **`↻ Resolver e retomar`** o devolve para
`EXECUTING`.

### Steps configuráveis

A fase de polimento é **dados**, não código: `config/pipeline.json` (override por projeto em
`<alvo>/.hii/pipeline.json`). Cada step pode ser **ativado/desativado, reordenado e customizado**
— lido do disco, **0 token** ao modelo.

```json
{
  "id": "arquitetura", "label": "Arquitetura", "kind": "quality",
  "agent": "rufus", "state": "REFINED",
  "gate": "none",        // none | test | verdict
  "enabled": true,
  "gated": true,         // se true, passa pelo Crivo antes de "pronto"
  "needs": [],           // dependências — define as ondas do DAG
  "instruction": "..."   // %s = objetivo do card
}
```

**`needs` monta o DAG.** Steps sem dependência pendente entram na **mesma onda** e podem rodar em
paralelo. No pipeline default, `testes` e `seguranca` dependem só de `arquitetura`, então formam
uma onda paralela:

```
1. Arquitetura     rufus [crivo]
2. ┌ Testes        testudo [crivo]   ← paralelo
   └ Seguranca     escudo  [crivo]
3. Review          crivo
4. Limpeza         pura
```

Dependência que aponta para um step **pulado pelo perfil** não trava a onda; ciclo não entra em
loop infinito (degrada para ordem de declaração).

### Gates reais

- **Visual** — screenshot (Playwright) obrigatório; distingue *falhou* de *inconclusivo* (nunca
  aprova por omissão). IA opcional via `HICODE_VISUAL_AI`.
- **Teste** (`gate: "test"`) — roda `npm test` no worktree com exit-code + reajuste.
- **Gated Nexus** (`gated: true`) — o padrão do Nexus no motor: **agente → Crivo revisa o diff →
  se BLOCKED, reexecuta com o motivo (retry) → se persistir, HALT**. Determinístico e por
  subprocesso (mantém multi-provedor).
- **Codefox** — gate adversarial final sobre o diff acumulado, antes do PR.
- **Spec (OpenSpec)** — `openspec validate --strict --json` como gate determinístico da fase de spec.

**Todos os gates são fail-closed.** A distinção que importa é entre *o gate rodou e reprovou* e
*o gate não rodou*:

| Situação | Resultado |
|---|---|
| gate rodou → `APPROVED` / `CONDITIONAL` | segue (as perguntas do Crivo vão no corpo do PR) |
| gate rodou → `BLOCKED` | **HALT** |
| gate não rodou (timeout, erro, saída sem veredito) | **HALT** — "não concluiu", nunca aprovação por omissão |

No gate **por step**, "não rodou" repete o **próprio gate** (`HICODE_GATE_RETRIES`) sem reexecutar
o agente: o trabalho estava bom, quem quebrou foi o juiz — reexecutar o agente seria desperdício e
ainda mentiria no prompt dizendo que o Crivo reprovou.

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

`hii init <repo>` cria **apenas** uma pasta `.hii/` no repo-alvo — **aditiva e não-destrutiva**
(nunca toca no `.claude/`, `CLAUDE.md` ou memória do próprio repo).

```
<repo-alvo>/.hii/
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
HICODE_TASK_SYNC=github-issues HICODE_GH_REPO=owner/repo hii sync
```

### Plugável em superfícies de controle (CLI, REPL, painel, MCP, bot)

Quatro pontos de extensão, cada um com uma interface própria:

| Extensão | Interface | Adapters incluídos |
|---|---|---|
| Origem do trabalho | `lib/tasks/` (`TaskSource` + registry) | GitHub Issues |
| Provedor de IA | `lib/ai/` (`AiProvider` + registry) | claude · codex · opencode · ollama |
| Passo de pipeline | `config/pipeline.json` (com `needs`) | 5 steps default |
| **Superfície de controle** | `lib/core/actions` | REPL · painel Nuxt |

Um cliente novo (MCP, bot de Slack, job de CI) implementa-se importando `lib/core/actions` —
nenhum transporte é obrigatório. HTTP, gRPC ou MCP são camadas finas **em cima** desses verbos,
adicionáveis depois sem tocar em cliente algum: pluggabilidade vem de um dono único do estado,
não do protocolo.

---

## Configuração (variáveis de ambiente)

| Var | Default | O quê |
|---|---|---|
| `HICODE_AI_PROVIDER` | `claude` | provedor default |
| `HICODE_{IMPLEMENT,VERIFY,GATE,STEP}_PROVIDER` | — | override por papel |
| `HICODE_VERIFY_MODEL` / `HICODE_GATE_MODEL` | `sonnet` | modelo (claude) de verify/gate |
| `HICODE_CODEX_MODEL` / `HICODE_OPENCODE_MODEL` / `HICODE_OLLAMA_MODEL` | — | modelo por provedor |
| `HICODE_OLLAMA_URL` | `http://localhost:11434` | endpoint do Ollama |
| `HICODE_VISUAL_AI` | `off` | `on` liga o check visual por IA (default: só screenshot + humano) |
| `HICODE_CLARIFY` | `on` | `off` desliga a fase de perguntas |
| `HICODE_EVAL` | `on` | `off` desliga a nota de qualidade pós-preview |
| `HICODE_PROJECT_MEMORY` | `on` | `off` não injeta nem grava `.hii/memory` |
| `HICODE_TASK_SYNC` | `none` | plugin de sync de tarefas (`github-issues`) |
| `HICODE_GH_REPO` | — | repo do adapter GitHub Issues |
| `HICODE_CONCURRENCY` | `3` | cards em paralelo |
| `HICODE_POLL_MS` | `5000` | intervalo do tick |
| `HICODE_RUN_TIMEOUT_MS` | `900000` | timeout por chamada de IA (SIGTERM→SIGKILL; worktree preservado no timeout) |
| `HICODE_PREVIEW_BASE` | `5200` | porta base dos previews |
| `HICODE_{REAJUSTE,CONFLICT}_RETRIES` | `2`/`2` | retries de reajuste e de conflito |
| `HICODE_GATE_RETRIES` | `1` | repetições do **gate** quando ele não conclui (não reexecuta o agente) |
| `HICODE_GATE_DIFF_LIMIT` | `60000` | corte do diff enviado ao gate |
| `HICODE_CARD_BUDGET_USD` | `0` | teto de custo por card (`0` = sem teto) |
| `HICODE_CARDS_DIR` | `<root>/cards` | onde os cards vivem — usado pelos testes para isolar |
| `HICODE_REPOS_FILE` | `<root>/config/repos.json` | registro de repos-alvo |
| `HICODE_RUNNER_PIDFILE` | `<root>/.runner.pid` | pidfile do daemon |
| `HICODE_LOCK_STALE_MS` | `15000` | idade a partir da qual um lock de card é considerado morto |
| `HICODE_LOCK_TIMEOUT_MS` | `10000` | espera máxima por um lock antes de quebrá-lo |

---

## Estrutura

```
runner.ts              entrypoint do processo do daemon (bun runner.ts)
bin/hii.ts             CLI `hii`/`hicode` — sem args abre o REPL, com args despacha
bin/repl.ts            laço de I/O da sessão interativa (fino: a lógica está em lib/core)
lib/core/              SUPERFÍCIE DE CONTROLE — o único dono das transições de estado
  actions.ts           verbos: submit · transition · resumeFrom · approvePreview · halt
                       requestCorrection · answerClarify · edit · setPreviewPid · remove
  plan.ts              plano determinístico do card (0 token)
  session.ts           dispatch do REPL (puro, testável sem TTY)
  daemon.ts            pid real do daemon + preferência de autostart
  render/              plan · fleet · phases — renderizadores puros
lib/ai/                provider de IA: types · usage · registry · adapters/{claude,codex,opencode,ollama}
lib/runner/            motor: queue · execute · finish · correct · merge · spec-phase · gated
  card-store.ts        updateCard — escritor único, com lock e rename atômico
  file-lock.ts         lock por arquivo (O_EXCL) + escrita atômica
  pipeline/            steps configuráveis (types + config + waves/DAG)
  progress.ts          board de progresso no terminal
  hicode-home.ts       resolve/provisiona o .hii/ do alvo
  hooks.ts             instala/remove o pre-push (hii hooks install)
  codefox-gate.ts      gate adversarial Crivo (por-step e final) + gateOutcome
lib/spec/openspec.ts   wrapper do OpenSpec (init/validate como gate determinístico)
lib/tasks/             plugin de sync de tarefas (interface + registry + adapters/github-issues)
lib/card/              domínio do card (frontmatter, tipos, helpers puros)
config/pipeline.json   steps default com `needs` (editável, 0 token)
config/repos.example.json  modelo do registro de alvos (versionado)
config/repos.json      registro local da maquina — NAO versionado (.gitignore)
cards/                 cards (<NNN>.md) + runs/*.json + previews/  — dados
lib/contract/          DETECCAO DETERMINISTICA do alvo (0 token): detect · probe · store
scripts/               runner-daemon.sh (daemonização/PID) · check-no-any.mjs
  setup/repo.mjs       `hii repo add|rm|ls` — registro do alvo, validado
  setup/contract.mjs   `hii contract` — redetecta stack e comandos do alvo
  hooks/pre-push       gate de pre-push determinístico e portátil (versionado)
test/                  testes (bun test)
.github/workflows/     ci.yml (typecheck + lint + testes)
panel/                 painel Nuxt — cliente fino de lib/core, não reimplementa card
plano/                 o plano do projeto (00..05)
docs/superpowers/specs/ design docs (contrato, multi-IA, gauntlet, loop governado)
.claude/               agentes Nexus, skills, hooks
```

### Quem pode escrever num card

**Somente `lib/core/actions`**, que chama `updateCard` — o escritor único, com lock entre
processos (`O_EXCL`) e escrita atômica (tmp + rename). Motor, painel e REPL são todos clientes.

Isso não é preferência de estilo: sem o lock, três escritores concorrentes perdiam **49% das
linhas de log** do card (medido: 614 de 1200 sobreviviam). E enquanto o painel reimplementava a
escrita, a lista de estados dele divergiu da do motor — faltava `CORRECTING`.

> Escrevendo um cliente novo (MCP, bot, CI)? Importe `lib/core/actions`. Nunca escreva o `.md`
> direto — é o caminho que reintroduz a corrida e a divergência.

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
  `hii hooks install`. A **revisão adversarial (codefox)** fica no **PR** via `/pre-review`. O
  motor pusha com `--no-verify` (ele já se auto-gateia). Pular o hook: `git push --no-verify` ou
  `SKIP_HOOK=1 git push`.

## Plano

O plano completo está em [`plano/`](plano/): resumo executivo, análise de metodologias, arquitetura,
decisões, roadmap e riscos.
