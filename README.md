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
  hii   daemon online (pid 48213)
  ┌──────────────────────────────────────────────────────────────┐
  │  #021 executing  adicionar selo beta no hero                 │
  │  ────────────────────────────────────────────────────────    │
  │  prompt   adicionar um selo "beta" no topo do hero           │
  │  depois   1. deixa o selo alinhado com o badge               │
  │  preview  http://localhost:5221  no ar agora                 │
  │  gasto    US$1.20 · 42k tokens                               │
  │                                                              │
  │  ⚑ precisa de voce  preview pronto — veja e decida           │
  │      enter    aprova e segue para o polimento                │
  │      /no 21   recusa e diz o que ajustar                     │
  │                                                              │
  │  ● Arquitetura   3min · US$1.20                              │
  │  ◐ Review      ← crivo · Read App.vue · 2min                 │
  │  ○ Limpeza                                                   │
  │                                                              │
  │  ⠹ vitro editando src/App.vue                                │
  └──────────────────────────────────────────────────────────────┘
  ┌─ ● hicode-site rafaelvpolan  tarefa #021 ────────────────────┐
  │ ›                                                            │
  └──────────────────────────────────────────────────────────────┘
    escreva para instruir · /board volta
  ia claude/opus · esforco (padrao do CLI) · gasto US$4.08
 ▌⠹ #021 adicionar selo beta no hero  executing · vitro · 2min  ← aberta
  ● #022 remova o selo do header      precisa da sua resposta → /ask 22
  1 tarefa esperando em cashbarber2 → /ask 23
```

A **área do prompt é um fieldset**: a legenda carrega o projeto (bolinha com cor própria por repo,
nome curto, dono) e, dentro de uma tarefa, o número dela. A dica fica em linha própria abaixo do
campo, discreta — não disputa espaço com o que você digita.

**Abaixo do input** ficam fixas as propriedades em uso (provedor/modelo, esforço, projeto, gasto
do dia — e um destaque quando algum papel usa provedor diferente), as **tarefas em execução** com
spinner e agente atual, e as que **esperam você**, cada uma com o comando que destrava. A tarefa
aberta leva barra na margem e `← aberta`. Tudo continua visível enquanto você digita.

Tarefa esperando em **outro projeto** também aparece, resumida — sem isso ela ficava invisível: o
card #023 estava em `CLARIFY` no `cashbarber2` enquanto o terminal apontava para o `hicode-site`, e
o filtro por projeto escondia a pergunta. Parecia que o clarify não funcionava.

### Dentro da tarefa

Entrar numa tarefa (`enter` no board ou no rodapé, ou `/watch <id>`) troca o corpo pela **tela da
tarefa**, com o cabeçalho **fixo** no topo enquanto a execução rola por baixo. Ele responde as
perguntas que importam:

- **prompt** original e os **sub-prompts** que você mandou depois (as 3 últimas, com contagem das
  anteriores);
- **preview** — o link só aparece quando responde de verdade;
- **gasto** acumulado da tarefa;
- **o que a tarefa precisa de você**, por estado, com a tecla que resolve;
- **o estado de cada passo** do pipeline: feito mostra tempo e custo lidos de `cards/runs`; o
  corrente leva seta e diz quem está trabalhando e em que ferramenta; pulado explica que o perfil o
  dispensou; parado diz `parado aqui`, então dá para ver onde travou.

**O que você escreve ali vira instrução daquela tarefa** — não cria card novo. Instrução em tarefa
já executada marca correção e reexecuta; em tarefa que ainda não executou, apenas anota; em tarefa
entregue, é recusada com a explicação de que isso pede tarefa nova. Colagem multilinha entra como
**uma** instrução, com as quebras preservadas como `⏎`.

Se o worktree tiver sumido, a instrução **refaz do zero** em vez de virar correção morta — sem isso,
toda instrução virava `CORRECTING` e o motor haltava 2 segundos depois, em laço.

`ctrl+c` dentro da tarefa **para a tarefa**, não o `hii`, e oferece retomar de onde parou.

| Comando | O quê |
|---|---|
| *texto livre* | **lido por tipo**: pedido de mudança cria o card e mostra o plano; pergunta é recusada sem criar nada |
| `⏎` (enter) | aprova o plano pendente — e, dentro de uma tarefa, faz a ação que o estado pede |
| `/new-task <mudança>` | cria a tarefa **direto**, sem a leitura de intenção |
| `/new-ask <pergunta>` | **responde** lendo o projeto, sem criar card nem worktree |
| `/new-session` | limpa a área e recomeça a sessão, mantendo o projeto |
| `/board` | abre o **quadro do projeto em tela própria** (`←` também abre) |
| `/cards [STATUS]` | lista, opcionalmente filtrando (`/cards HALTED`) |
| `/plan <id>` | reexibe o plano de um card |
| `/watch <id>` | entra na tarefa e segue a execução ao vivo |
| `/agents <id>` | **agentes, skills e ferramentas** que rodaram no card |
| `/ask [id]` | responde a pergunta que travou a tarefa (sem id, pega a primeira) |
| **`/ok <id>`** | **aprova o preview que você viu no dev server** |
| **`/no <id> [o que]`** | rejeita o preview; com motivo, pede correção em vez de refazer |
| `/preview [id]` | sobe o dev server da tarefa; sem id, lista os que rodam (`--limpar` derruba órfãos) |
| `/stop <id> [motivo]` | para a tarefa em execução (`/halt` é o mesmo) |
| `/rm <id> [id...]` | apaga tarefas **em lote** e limpa worktree, preview e logs |
| `/ia [papel] <provedor>` | escolhe a IA que roda cada papel |
| `/model [papel] <modelo>` | escolhe o modelo da IA atual |
| `/effort [papel] <nível>` | escolhe o esforço da IA atual |
| `/repo` | troca de projeto (reabre a lista); `/repo <nome>` vai direto (`/project` é o mesmo) |
| `20` ou `#20` | mostra o plano do card 20 — **número puro consulta, não cria tarefa** |
| `/exit` | sai — **não** derruba o daemon nem os cards (`/quit` é o mesmo) |

Todo comando tem apelido em português (`/nova-tarefa`, `/parar`, `/apagar`, `/modelo`, `/esforco`,
`/projeto`…), e um teste de varredura garante que **apelido e principal se comportam igual** —
mesmo efeito e mesmo autocompletar. Sem argumento, `/ia`, `/model` e `/effort` **listam as opções**
em vez de dar erro.

### Tipo de prompt: `task` e `ask`

O motor executa tarefas. Uma pergunta não tem lugar na fila, então a entrada é classificada antes
de gastar qualquer token — a checagem é local, **custo zero**:

```
› tem acesso ao NTN da Podium para criar tarefas?

  ? lido como pergunta  abre consultando — o verbo de acao adiante e finalidade
    tem acesso ao NTN da Podium para criar tarefas?

    nao criei card — pergunta — o hii executa tarefas, entao nao entra na fila
    para virar tarefa, escreva o que mudar: "remove o selo beta do header"
```

A distinção que importa é entre **consulta** e **pedido**:

| padrão | leitura | exemplo |
|---|---|---|
| consulta no início (`tem`, `existe`, `qual`, `como`, `é possível`, `você sabe`) | `ask` — **mesmo com verbo de ação depois** | `tem acesso ao NTN para criar tarefas?` |
| pedido + verbo de mudança (`pode`, `consegue`, `dá pra`) | `task` | `pode remover o selo beta?` |
| pedido sem verbo de mudança | `ask` (viabilidade) | `dá pra rodar isso local?` |
| verbo de mudança sozinho | `task` | `remove o selo beta` |
| relato de problema | `task` | `o rodapé está desalinhado no mobile` |

Quando a leitura erra, `/new-task` cria direto — você declara a intenção em vez de discutir com o
heurístico. E `/new-ask` responde a pergunta em modo somente-leitura, mostrando provedor e custo.
A resposta é **quebrada na largura**, não truncada — resposta cortada com `…` perde conteúdo.

**IA local no desempate (opcional).** O heurístico sabe quando não sabe: `estou me referindo à
conexão com o Notion` não tem marca de pergunta nem verbo de mudança, então sai como `task` com
**confiança baixa**. Ligando `HICODE_CLASSIFY=on`, esses casos — e só esses — vão para um modelo
local classificar:

```bash
HICODE_CLASSIFY=on
HICODE_CLASSIFY_PROVIDER=ollama     # qualquer provedor registrado
HICODE_CLASSIFY_MODEL=llama3.2      # modelo pequeno basta: entra texto, sai um rótulo
HICODE_CLASSIFY_TIMEOUT_MS=15000
```

É cascata, não substituição: **confiança alta não gasta chamada** (a maioria dos casos), e a
classificação custa ~0 quando o modelo é local. Se a IA responder ambíguo, se estiver fora do ar ou
se o timeout estourar, o heurístico prevalece — a classificação nunca fica sem resposta.

> **Por que isso existe:** sem essa checagem, `tem acesso ao NTN?` virou o card #023, subiu worktree
> e branch, e o clarify perguntou *"o que a implementação deve entregar?"* oferecendo badge e
> integração. O prompt do clarify **afirma** que a entrada é tarefa, então a IA inventou uma
> implementação para poder responder. US$0,21 gastos numa pergunta.

Com mais de um projeto registrado, a sessão **abre pela lista de projetos** — com quantos cards
cada um tem, quantos esperam você, quantos rodam e quantos pararam. Você entra em um e tudo depois
disso é **escopado a ele**: board, `/cards`, a faixa da frota. Com um projeto só, entra direto.

**Colar funciona** — link, texto ou bloco inteiro, **de uma vez só** (um redesenho, sem animação
de tecla), inclusive quando o terminal parte a colagem em vários pedaços. Colagem grande vira um
marcador compacto (`[colado #1 · 47 linhas]`) e só expande no envio.

**URL vira clicável** (OSC 8) no log e no board — `ctrl+clique` no terminal que suportar; nos
demais aparece como texto normal.

**Navegação por tecla — três destinos, decididos pelo estado do campo:**

Com o campo **vazio**, as setas e o `shift+tab` deixam de mexer no texto e passam a navegar:

| Tecla (campo vazio) | Vai para |
|---|---|
| `↓` | as **tarefas fixadas no rodapé** — em execução primeiro, depois as que esperam você |
| `←` | o **board em tela própria**, sem log e sem input |
| `shift+tab` | os **ajustes de IA** no rodapé |

Dentro de qualquer um: `↑↓` movem, `enter` entra na tarefa, `→` ou `esc` saem. No board, `tab`
troca de projeto. Nos ajustes, `tab` troca o valor do campo escolhido e `shift+tab` sai.

```
  ajustes · ↑↓ escolhe · tab troca · shift+tab sai
  executa · ia       claude
▌ executa · esforco  high
  revisa · ia        codex
  revisa · esforco   (padrao)
```

São **IA e esforço por papel** — dá para deixar o revisor no topo de linha e baratear só quem
executa. A troca vale na **próxima instrução**, sem reiniciar nada.

**Teclas do input:**

| Tecla | O quê |
|---|---|
| `ctrl+←` `ctrl+→` · `alt+←` `alt+→` · `esc b` `esc f` | move por palavra |
| `ctrl+backspace` · `alt+backspace` | apaga a palavra anterior |
| `alt+d` | apaga a palavra à frente |
| `ctrl+u` · `ctrl+k` | apaga até o início · até o fim da linha |
| `ctrl+a` `ctrl+e` · `home` `end` | início · fim |
| `↑` `↓` | histórico (com o campo escrito; vazio, `↓` navega o rodapé) |
| `tab` | completa comando, projeto, id, provedor, modelo ou esforço |
| **`ctrl+j`** ou **`\` + `enter`** | **quebra linha** sem enviar |
| `ctrl+l` | limpa a área de execuções — **menos** com tarefa rodando |
| `ctrl+c` | dentro de uma tarefa, **para a tarefa** e oferece retomar; fora, sai |
| `enter` | envia |

> **Sobre `shift+enter`:** a maioria dos terminais **não distingue** `shift+enter` de `enter` — os
> dois mandam o mesmo byte. Rode **`hii teclas`** para ver o que o seu manda de fato; ele diz se
> funciona e, quando não, imprime o trecho de `settings.json` do Windows Terminal que resolve.
> **`hii teclas --corrigir`** aplica esse trecho sozinho (com backup e validação do JSON antes de
> gravar). Enquanto isso, `ctrl+j` quebra linha em qualquer terminal.

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
hii rm <id> [id...] --yes  # apaga cards e limpa worktree, preview e logs
hii board [repo]     # o quadro do projeto fora do REPL (--watch atualiza sozinho)
hii teclas           # mostra o que o seu terminal manda em cada tecla
hii teclas --corrigir     # ensina o Windows Terminal a mandar shift+enter
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

Também há um script Node puro, sem TUI e sem IA, para apagar card:

```bash
node scripts/apagar-card.mjs 23 24 25 --yes   # sem --yes, só mostra o que faria
```

Suíte de qualidade do próprio hicode:

```bash
bun run test         # tsc --noEmit + lint no-any + testes (bun test) + typecheck do painel
bun run test:unit    # só os testes unitários
```

> **Rode `bun run test`, não os quatro em separado.** É o que a CI roda. Numa sessão inteira eu
> rodei `typecheck`, `test:unit` e `typecheck:panel` isolados e deixei o `lint:types` de fora — a
> falha só apareceu no GitHub.
>
> Verde local também não é prova: três testes de OSC 8 passavam por lerem `WT_SESSION` do terminal
> do dev e falhavam na CI, que não tem variável de terminal. Teste que depende do ambiente de quem
> roda não testa nada.

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

`hii start` só declara sucesso depois de confirmar que o motor sobreviveu ao arranque: se ele
morrer logo (ex.: um `hii once` em andamento já segura a trava de instância), o comando sai `≠ 0`,
mostra o fim do `.runner.log` e **não** deixa pidfile apontando para processo morto.

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

## Ideação divergente na clareza da tarefa

Quando o pedido é **de abordagem** ("como estruturar o cache", "melhor arquitetura para X"), o
clarify deixa de só perguntar e passa a **gerar as opções**: N ramos isolados, cada um sob uma
**lente cognitiva** diferente (inversão, atacante, 3h da manhã, US$0/1h, orçamento infinito,
remoção de premissa, criança de 10 anos, regulador, speedrunner, logística), sem se enxergarem —
o isolamento é o que evita ancoragem. Depois um **crítico que não gerou nenhuma delas** pontua
novidade / viabilidade / aderência, marca uma **não-óbvia-mas-viável** e lista as **armadilhas**.

A shortlist vira as opções da pergunta, e a armadilha entra no enunciado:

```
Qual abordagem seguir? (evitar: cache no cliente — invalida errado sob deploy)
  › [inversão] pré-computar no build e servir estático   ← recomendado
    [3h da manhã] TTL curto com fallback para o último bom
    [US$0/1h] cabeçalho de cache no proxy que já existe
```

**Portão determinístico, antes de gastar token:** só roda em pedido aberto. Perfil `micro`/`enxuto`,
resposta canônica (typo, renomear, bump) ou pedido que já diz "rápido/simples" **não ideiam** — e
o motivo fica no log. Override no card: `ideate: on|off`.

> **Custo:** são N+1 chamadas (padrão: 5). Adaptado de
> [UditAkhourii/adhd](https://github.com/uditakhourii/adhd), implementado nativo em vez de instalar
> a skill — assim funciona com qualquer provedor, entra na contabilidade de custo do card e obedece
> ao portão do analisador. Os ganhos que o repositório original publica são auto-reportados,
> julgados por LLM sobre 6 problemas: trate como promissor, não como medido.

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

**Falha passageira não vira HALT.** Rede fora, 5xx, timeout e 429 mandam o card para `WAITING`, com
motivo legível, número da tentativa e horário do próximo retry no frontmatter. Uma sonda barata testa
o provedor; quando ele volta, a tarefa **retoma do passo em que parou**, sozinha. Credencial inválida
e provedor ausente continuam haltando na hora — e **falha desconhecida cai em terminal**, o lado
seguro: errar para o lado de parar custa uma retomada manual, errar para o lado de repetir custa
dinheiro em laço.

O contador de tentativas só cresce quando a **sonda** falha, e a execução caro só acontece depois de
uma sonda que passou. Então o teto (`HICODE_WAITING_MAX_ATTEMPTS`, default 8) mede **duração da
indisponibilidade** — cerca de 38 min com o backoff até 10 min — e não execuções pagas. `WAITING`
sobrevive a reinício: vencido volta para a fila, no prazo continua esperando.

**Cota estourada PARA.** Ao detectar limite de cota, o motor não troca de provedor sozinho, mesmo
havendo outro configurado — trocar de modelo no meio muda o resultado da tarefa em silêncio. A troca
existe por configuração explícita (`HICODE_QUOTA_FALLBACK=on`), desligada por padrão, e há teste
trancando esse comportamento.

**O daemon sobrevive a um tick com erro.** `setInterval(tick)` rodava sem `try/catch`: uma exceção
em `podar()` ou uma promise rejeitada derrubava o daemon inteiro, e você só descobria porque nada
andava. Agora o erro é registrado, o próximo tick acontece, e falha repetida vira alerta em vez de
silêncio.

**Fechar o terminal não derruba o daemon** — ele já sobe com `nohup`, sem terminal de controle
(`PPID=1`), e o estado vive nos cards. `git pull` também não muda o processo em execução: depois de
atualizar, **`hii restart`**.

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
| **ollama** | não¹ | 0 medido² / tokens | verify, gate (local, barato) | verificado ao vivo |
| **codex** | sim | tokens (sem $) | implement, step | pronto (requer CLI + auth) |

¹ Ollama sozinho não edita arquivos (sem loop de tools): sirva-o em papéis de leitura (`verify`,
`gate`). Quem implementa e roda steps é `claude` ou `codex`.

² O zero só vale como **medição** quando `HICODE_OLLAMA_URL` aponta para loopback/rede privada. Um
endpoint remoto (gateway pago, endpoint compatível cobrado) pode custar dinheiro que o adaptador
não enxerga: nesse caso o custo entra como **não medido** e o card ganha `cost_unverified`.

`cost_unverified` é estado corrente (**quem** está sem reportar agora) e some quando aquele
provedor volta a medir. O que **não** some é `cost_floor`: uma chamada que concluiu sem reportar
some do `cost_usd` para sempre, então o total do card vira **piso** e continua piso mesmo depois
que o provedor volta a medir. É `cost_floor` que faz o gate de `HICODE_CARD_BUDGET_USD` registrar
que está comparando um total sabidamente subestimado.

Os dois campos são independentes de propósito, e a **chamada que falhou** é o caso que separa os
dois. Timeout, exit≠0 ou `is_error` significam que a CLI já queimou tokens e morreu antes de
reportar: esse gasto some do `cost_usd` igual (ou mais) que o da chamada que concluiu sem reportar,
então ela grava `cost_floor` — mas **não** grava `cost_unverified`, porque não é o provedor que
"não sabe medir", foi a chamada que não chegou ao fim. O card ganha a linha `chamada a <provedor>
terminou sem concluir` e o gate de teto passa a recusar a garantia dali em diante.

### Escolher IA, modelo e esforço

A escolha é **por papel** — é o que permite revisor caro com execução barata. Três formas, com
precedência do mais específico para o mais geral:

| Fonte | Onde | Vale quando |
|---|---|---|
| override do card | `provider_override_implement` | escrito pelo motor (fallback de cota) |
| **preferência** | `config/ia.json` | **na próxima instrução, sem reiniciar** |
| variável de ambiente | `.env` na raiz | **no arranque** do processo |
| padrão | `claude` | nada configurado |

**Sem reiniciar** — pela sessão (`shift+tab` nos ajustes, ou comando):

```
/ia gate codex          # troca a IA do gate
/model gate opus        # modelo daquela IA
/effort implement high  # esforço de quem executa
/ia padrao gate         # volta o gate ao padrão
```

Isso grava `config/ia.json` (local, fora do git), lido **por chamada** com invalidação por mtime.
O painel expõe a mesma leitura e escrita em `GET`/`POST /api/ia`.

**Configuração inicial** — `.env` na raiz, lido pelo Bun no arranque do daemon:

```bash
HICODE_AI_PROVIDER=claude          # default de todos os papéis
HICODE_IMPLEMENT_PROVIDER=codex    # override por papel: implement | verify | gate | step
HICODE_VERIFY_PROVIDER=ollama
HICODE_GATE_PROVIDER=claude
HICODE_EFFORT=high                 # esforço default
```

Depois de mexer no `.env`, **`hii restart`** — o daemon carrega o código e as variáveis no arranque,
e `git pull` sozinho não muda o processo que já está rodando.

### Esforço

Vai para o CLI como argumento real: `--effort` no `claude` (aceita `low` `medium` `high` `xhigh`
`max`) e `-c model_reasoning_effort` no `codex`. Quando nada está configurado, **nada é enviado** e
o CLI usa o próprio padrão — o rodapé mostra `(padrao do CLI)` em vez de inventar um valor.

### Catálogo de modelos

Os CLIs **não listam modelos** (`claude --help` só tem `--model <model>`), então o catálogo é
arquivo, não constante: `config/modelos.json`, com semente mínima e os modelos em uso. Um modelo
fora do catálogo é **aceito com aviso** — não invento lista nem bloqueio o que pode funcionar.

```json
{ "claude": ["opus", "sonnet", "haiku"], "codex": ["gpt-5.5"] }
```

`/ia`, sem argumento, mostra o que você **realmente** tem: por provedor, se o CLI está no `PATH`,
se depende de servidor no ar, o modelo em vigor e quais papéis o usam.

```
  provedores
    claude  instalado                   modelo padrao do CLI · em uso: implement, verify, gate, step
    codex   NAO instalado               modelo padrao do CLI · nenhum papel
            instale o CLI do Codex
    ollama  precisa do servidor no ar   modelo padrao do CLI · nenhum papel
```

Nome de provedor **desconhecido não passa em silêncio**. No arranque o motor escreve em stderr
`AVISO: provedor "X" configurado em <ENV> nao existe (provedores: ...) — usando <Y>`, valendo para
`HICODE_AI_PROVIDER`, os quatro overrides por papel e os `HICODE_{papel}_QUOTA_FALLBACK_PROVIDER`.
Quando o nome vem do card (`provider_override_implement`, escrito pelo fallback de cota), a
substituição é registrada **no próprio card**: campo `provider_unknown` + linha no log do card.

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
| Provedor de IA | `lib/ai/` (`AiProvider` + registry) | claude · codex · ollama |
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
| `HICODE_CODEX_MODEL` / `HICODE_OLLAMA_MODEL` | — | modelo por provedor |
| `HICODE_EFFORT` | — | esforço default; vazio = padrão do próprio CLI |
| `HICODE_IA_FILE` | `<root>/config/ia.json` | preferências de IA por papel (lidas **por chamada**) |
| `HICODE_MODELOS_FILE` | `<root>/config/modelos.json` | catálogo de modelos por provedor |
| `HICODE_OLLAMA_URL` | `http://localhost:11434` | endpoint do Ollama |
| `HICODE_VISUAL_AI` | `off` | `on` liga o check visual por IA (default: só screenshot + humano) |
| `HICODE_CLARIFY` | `on` | `off` desliga a fase de perguntas |
| `HICODE_CLASSIFY` | `off` | `on` usa IA para desempatar task vs ask em caso de dúvida |
| `HICODE_CLASSIFY_PROVIDER` / `_MODEL` / `_TIMEOUT_MS` | — / — / `15000` | provedor, modelo e teto do classificador |
| `HICODE_WAITING_MAX_ATTEMPTS` | `8` | tentativas de espera antes de HALT (mede duração do outage) |
| `HICODE_QUOTA_FALLBACK` | `off` | `on` permite trocar de provedor quando a cota estoura |
| `HICODE_IDEATE_FRAMES` / `_IDEAS` / `_TOPK` | `4`/`5`/`3` | lentes, ideias por lente e tamanho da shortlist |
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
| `HICODE_RUNNER_PIDFILE` | `<root>/.runner.pid` | pidfile do daemon (identidade: quem o `hii start`/`stop` controla) |
| `HICODE_RUNNER_LOCK` | `<root>/.runner.lock` | trava de instância única — tomada pelo daemon **e** pelo `--once` |
| `HICODE_LOCK_STALE_MS` | `15000` | idade a partir da qual um lock de card é considerado morto |
| `HICODE_LOCK_TIMEOUT_MS` | `10000` | espera máxima por um lock antes de quebrá-lo |
| `HICODE_HYPERLINKS` | detectado | `on`/`off` força ou desliga link clicável (OSC 8) |

**Env é configuração inicial** — lida no arranque do processo. Para trocar de IA, modelo ou esforço
**sem reiniciar**, use `/ia`, `/model`, `/effort` ou os ajustes (`shift+tab`), que gravam
`config/ia.json` e valem na próxima instrução.

Os três arquivos locais (`config/repos.json`, `config/ia.json`, `config/modelos.json`) ficam **fora
do git** por decisão: alvo e credencial de máquina não vão para o repositório. Isso tem um custo que
vale saber — o `config/repos.json` já sumiu uma vez e o board apareceu sem projeto. O motor hoje
sobrevive a isso (os projetos citados pelos cards entram na lista, marcados como fora do registro),
mas se você usa mais de uma máquina, guarde uma cópia fora do repo.

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
lib/ai/                provider de IA: types · usage · registry · adapters/{claude,codex,ollama}
lib/runner/            motor: queue · execute · finish · correct · merge · spec-phase · gated
  card-store.ts        updateCard — escritor único, com lock e rename atômico
  file-lock.ts         lock por arquivo (O_EXCL) + escrita atômica
  instance-lock.ts     trava de instância única (link atômico + dono conferido pelo cmdline)
  cost-trust.ts        runProvider — única porta para provider.run, carimba custo não medido
  url-guard.ts         validação de URL + private-net.ts (loopback/RFC1918/IPv6 mapeado)
  redirect.ts          seguidor de redirect: cada salto revalidado · download.ts (curl sem -L)
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

## Isolamento dos próprios testes

Três testes de varredura em `test/isolamento-de-testes.test.ts` leem o código dos **outros testes**
e reprovam padrões que já causaram estrago real:

| Regra | Por que existe |
|---|---|
| teste que escreve card **isola** `HICODE_CARDS_DIR` | sem isso, o teste cria card no `cards/` de verdade — aconteceu, seis cards vazaram |
| teste que usa `link()`/`linkificar()` **fixa** `HICODE_HYPERLINKS` | três testes passavam por lerem `WT_SESSION` do dev e falhavam na CI |
| nenhum teste aponta para `config/{repos,ia,modelos}.json` real | é config local do usuário, não fixture |

O padrão comum: **verde na máquina de quem escreveu não é prova**. Esses três leem a fonte em vez de
confiar em disciplina.

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
