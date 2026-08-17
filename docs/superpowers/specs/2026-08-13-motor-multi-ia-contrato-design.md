# Design — motor hicode: contrato de repositório, malha multi-IA e loop autônomo governado

Data: 2026-08-13
Status: proposta (aguardando revisão humana)
Escopo: `runner.ts`, `lib/runner/*`, `lib/ai/*`, `bin/hii.ts`, `config/*`, `<alvo>/.hii/*`

---

## 1. Problema

O motor hoje executa o ciclo card → worktree → preview → polimento → gate → PR com decisões
estruturais corretas: gate lê exit code real em disco, `withGitLock` serializa git, timeout
SIGTERM→SIGKILL preservando worktree, merge sempre humano. O esqueleto está certo.

O que não está: o motor **só serve a um repositório**. O stack do alvo, o gerenciador de pacotes,
os comandos de build/test/dev e os padrões de revisão estão escritos no código-fonte do motor.
Trocar o alvo por um monorepo, ou por qualquer coisa que não seja Vite + Vue 3 + npm, produz
prompts que mentem para a IA e comandos que não existem.

Somado a isso: a camada multi-IA existe como interface mas roteia grosso e sem malha de segurança;
o revisor é juiz único e, por default, da mesma família de quem escreveu; o pipeline é lista
linear sem paralelismo intra-card; e a espinha do sistema (o card em markdown) é escrita sem
atomicidade por dois processos.

Este documento desenha o alvo e a ordem dos incrementos.

---

## 2. Auditoria — o que está soldado

### 2.1 Stack e comandos fixos no motor

| Local | O que está fixo |
|---|---|
| `lib/runner/agent.ts:35,40,120` | o prompt **afirma** "(Vite + Vue 3 + TypeScript). Edite os arquivos em `src/`" |
| `lib/runner/codefox-gate.ts:92` | o gate cobra os padrões do **hicode** ("Vue 3 Composition API (nunca React)"), não os do alvo |
| `lib/runner/finish.ts:35,58` | `npm run build` / `npm test` — sem pnpm/yarn/bun, sem turbo/nx, sem lint/typecheck separados |
| `lib/runner/preview.ts:41` | `npm run dev -- --port --strictPort --host` — flags do Vite |
| `lib/runner/preview.ts:17-33` | `hasBuildScript`/`hasTestScript` leem só o `package.json` da raiz → monorepo cego |
| `lib/card/types.ts:27` | `runCmd` existe no schema, o painel coleta, **nada lê** |

E o repositório tem um `.codefox.yaml` completo — `tools` com `command`/`paths`/`working_dir`/
`timeout_seconds`/`blocking`, mais `priorities`, `severity`, `path_instructions` — que o motor
**não lê em lugar nenhum**. O formato de contrato já existe e está testado
(`.shared/codefox/codefox.template.yaml`).

### 2.2 Multi-IA sem malha de segurança

- `lib/ai/registry.ts:15-20`: quatro papéis grossos (`implement|verify|gate|step`) × **um provedor
  global por papel**. Todos os steps dividem `HICODE_STEP_PROVIDER` — não existe "testudo no
  deepseek, escudo no claude".
- Zero fallback: provedor cai ou timeouta → `HALTED` (`finish.ts:193`, `gated.ts:39`). O retry
  repete a mesma receita: mesmo modelo, mesmo prompt.
- Custo cego: `codex.ts:63` e `ollama.ts:47` retornam `cost: 0` sempre → `CARD_BUDGET_USD`
  (`finish.ts:151`) é decorativo para tudo que não é claude.
- `supportsVision` é flag do **provedor** (`codex.ts:48`, `opencode.ts:50` = `false`) quando
  deveria ser do **modelo**; por isso as imagens de referência do card são descartadas
  (`agent.ts:64`) mesmo com modelo multimodal atrás.
- Nenhum registro de qual modelo executou qual step. Sem isso não há governança.

### 2.3 Pipeline linear, revisor único

- `finish.ts:176` é um `for` sequencial; `pipeline/types.ts` não tem `needs`. Testes e Segurança
  são independentes e somam latência.
- Por default `implement` e `gate` caem no mesmo provedor (`registry.ts:30-35`) → viés de autor.
- Voto único, uma amostra, sem lentes distintas.
- Falha de parsing = reprovação: JSON ilegível vira `ok:false` (`codefox-gate.ts:139`) e queima
  tentativa (`gated.ts:39`). Modelo loquaz reprova por formatação, não por defeito.
- Diff cortado em 60k chars no meio do patch (`config.ts:17`) sem o revisor saber que é parcial.
- `eval` produz score 0–5 e é ignorado (`execute.ts:210-216`).

### 2.3.1 Gate final falha-aberto (crítico)

`finish.ts:237` decide **só** pelo `gate.verdict` e ignora o `gate.ok`. Mas
`codefox-gate.ts:135,139` retornam `{ok:false, verdict:'CONDITIONAL'}` tanto para falha de infra
(timeout/erro) quanto para saída não-parseável. Resultado: **gate que não rodou deixa o PR abrir.**

A assimetria prova que é defeito, não design: o gate por-step (`gated.ts:38`) faz
`if (gate.ok && verdict !== 'BLOCKED')` — fail-closed. O gate final, que é a porta
anti-rendição-cognitiva, é fail-open.

Correção: discriminar pelo `ok` primeiro (`!ok` → HALT "gate não concluiu"), depois pelo verdict.
O gate roda antes do `push` (`:244`), então o HALT não deixa meio-estado. `CONDITIONAL` continua
abrindo PR — isso é design (as perguntas vão no corpo do PR), não o bug.

Sem esta correção, todo o §8 (painel, ancoragem, quorum) é decorativo: a saída do gate não é
consultada quando ele falha.

### 2.4 Integridade e retomada

- `queue.ts:17-22`: no restart do daemon, card em `REFINED/TESTS_GREEN/...` volta a `PREVIEW_OK` e
  **refaz o finish inteiro**. O `resume_from` existe (`finish.ts:166`) e o reconcile não o usa.
- `card-store.ts:31-39`: `patchCard` é read-modify-write, `writeFileSync` direto, **sem lock e sem
  atomicidade**, com dois escritores (motor + painel `card-mutations.ts`). Corrida perde log;
  crash trunca o card — que é a única fonte de verdade.
- **Dois daemons são possíveis.** A trava de instância mora só no shell: `runner-daemon.sh:28`
  lê o pidfile e o `start` (`:36`) recusa duplicata, mas `hii run` (`bin/hii.ts:97`) chama
  `bun runner.ts` **direto**, sem passar pelo wrapper. `hii start` + `hii run` = dois motores nos
  mesmos cards, correndo no `patchCard` não-atômico. O lock precisa estar dentro do `runner.ts`.
- **SSRF por redirect** (`refs.ts:69`): `curl -sL --max-redirs 3` valida **só o host inicial**
  (`safeHttpUrl`, `:18-27`). A blocklist de `:6-16` cobre loopback, RFC1918, link-local, CGNAT e
  ULA — mas roda uma vez, antes do primeiro salto; um redirect para `169.254.169.254` passa. Hoje
  atinge imagens de referência; com §4.3 passa a atingir a **ingestão do contrato**. Sem teste.
- `queue.ts:50-53` chama `cardsByStatus` 4×, e cada chamada relê e parseia **todos** os cards, a
  cada `POLL_MS` (5s). Com 19 cards são 76 leituras+parses por tick, indefinidamente.
- Timeout único de 900s (`agent.ts:142`) para uma feature e para remover comentários.
- `config.ts:18` tem `VISUAL_AI` default `off`; o README diz `on`.

### 2.5 Observabilidade e composição

- `hii watch` (`bin/hii.ts:91`) limpa a tela inteira (`\x1b[2J`) a cada 2s; uma linha por card
  (`progress.ts:45`); nenhuma visibilidade do que a IA faz agora — apesar de `runs/<id>.live.log`
  já existir (`agent.ts:75`).
- `runner.ts:26` sai **sempre com 0** (`process.exit(0)`) — nenhum workflow consegue ramificar no
  resultado.
- Três verdades sobrepostas: log em prosa dentro do card, métricas em `runs/*.json`, texto cru em
  `*.live.log`.

### 2.6 Entrega

`finish.ts:250`: sempre um PR por card, sem teto de arquivos. Card grande produz PR ingerível.

---

## 3. Arquitetura alvo

```
INBOX
 └─ BRAINSTORM ................... pergunta TUDO antes · uma por vez · fail-closed
     └─ só o que contrato/índice não resolvem sozinhos
 └─ PLANO ........................ o que será feito · é layout? · agentes+skills · IA por step
     └─ arquivos/pacotes tocados · fatias (se pilha) · custo estimado · COMO será verificado
     └─ PLAN_APPROVED ............ humano aprova · SEMPRE, para todo card
 └─ SPEC ......................... só grande/breaking · gate: openspec validate --strict
 └─ LAYOUT ....................... se o plano aprovou · monofile, na stack do projeto, sem contrato
     └─ PREVIEW_LAYOUT ........... humano vê no DEV SERVER e aprova · o screenshot vira a barra do §8.2
 └─ EXECUTE ...................... contrato de CRIAÇÃO (fino)
     └─ PREVIEW .................. aprovação humana (auto se não-visual)
 └─ POLIMENTO (DAG) .............. arquitetura → { testes ∥ segurança }
 └─ E2E .......................... qa-tester + Playwright · gate: exit code real
 └─ JULGAMENTO ................... gauntlet (A/B cego vs barra nomeada) se effort:max e barra válida
                                   senão rubrica 0–10 · painel cross-família · mediana · platô
 └─ REVISÃO ...................... contrato de REVISÃO (crivo + invariantes determinísticos)
 └─ PR_OPEN ...................... para. merge é humano.
```

Compatível com o "Princípio nº 1" do `CLAUDE.md`: layout-first é o refinamento de "resultado
funcional mínimo" para tarefa visual — o primeiro artefato executável de uma tela é o layout.

A via rápida corta o grafo: card classificado como **`micro`** (§6) vai de INBOX direto a
lookup → patch → PREVIEW → gate.

---

### 3.1 Brainstorm e plano — a porta de entrada de todo card

**Todo card passa por plano aprovado por humano. Sem exceção.** O que escala com a simplicidade da
tarefa é o **artefato**, nunca o **gate**: para um card `micro` o plano é uma linha; para uma
feature com `pilha: on` são as fatias e os agentes. A aprovação é igual nos dois casos.

#### Brainstorm — perguntar tudo antes, mas só o que importa

Duas correções ao que existe hoje:

1. **Fail-closed.** `clarify.ts` hoje é fail-open: JSON não-parseável vira "tarefa clara" e o card
   segue (`execute.ts:105`). Sob "perguntar tudo antes", saída ilegível significa **perguntar ao
   humano**, nunca prosseguir. É o mesmo defeito do gate final (§2.3.1), na outra ponta do pipeline.
2. **Depois do contrato e do índice, não antes.** O motor só pergunta o que **não consegue
   descobrir sozinho**. Perguntar "qual framework?" quando o contrato (§4) sabe, ou "onde fica esse
   texto?" quando o índice (§6) resolve, é ruído — e ruído treina a pessoa a carimbar sem ler, que
   destrói justamente o gate que estamos criando.

Formato: **uma pergunta por vez**, múltipla escolha quando couber, focadas em propósito, restrição
e critério de sucesso. Pergunta cuja resposta não muda o que será feito não deve ser feita.

#### O plano — o que precisa conter para ser aprovável

| Campo | Origem |
|---|---|
| **É layout?** sim/não + por quê; se sim, propõe `layout: on` | analisador (§6.1, corte localizado × subjetivo) |
| Perfil de steps e quais rodam | `analyze.ts` (§ perfis) |
| **Agentes e skills por step**, com justificativa | catálogo Nexus (`.claude/agents/`) + skills |
| **Qual IA em cada step** + `effort` | router (§7.3), marcando o que **exige `claude`** (D10) |
| Arquivos/pacotes que serão tocados | contrato + índice — é o que permite pegar erro de escopo |
| Fatias, se `pilha: on` | decomposição proposta (§14) |
| Barra do gauntlet, se `effort: max` | §8.2, com o gate de validação da barra |
| **Custo estimado** | tabela de preço × tamanho de prompt (depende de R1) |
| **Como será verificado** | E2E, invariantes, preview, A/B — declarado *antes* de fazer |

Os dois últimos são os que mais mudam a conversa. Custo estimado antes de gastar transforma "isso
saiu caro" em decisão consciente. E declarar o critério de verificação antes de executar é o
elemento *metric* do loop engineering (§8.2): sem ele, o sucesso é negociado depois do fato.

A marcação de **o que exige `claude`** é o que torna a restrição D10 visível: o plano mostra, por
step, se a escolha de IA barata desligaria skill ou MCP — em vez de degradar em silêncio.

#### Aprovação visual é humana, no dev server

A parte visual é validada por **quem pediu**, no dev server em execução — não por visão de IA. O
motor entrega URL viva e estável; `VISUAL_AI` fica **off** por padrão (o código já é assim em
`config.ts:18`; o README é que está errado).

A IA **nunca aprova intenção visual**. Ela só é usada depois, no refino, para conferir **fidelidade
ao screenshot que o humano já aprovou** (o A/B do §8.2). A linha é essa: humano decide se é o
resultado certo; IA verifica se a implementação sob contrato continua batendo com o que foi
aprovado.

## 4. Peça 1 — contrato do repositório

### 4.1 Forma

`<alvo>/.hii/contract.json`, **derivado**, nunca escrito à mão, com hash das fontes. Regenerado
quando o hash muda. Fonte de verdade para todo comando que o motor executa no alvo.

### 4.2 Como nasce

**Estágio 1 — probe determinístico (0 token).** Lockfile → gerenciador. `pnpm-workspace.yaml` /
`workspaces` / `turbo.json` / `nx.json` → pacotes com `path`, `name`, `scripts`. Dependências →
framework. `vite.config`/`nuxt.config`/`next.config` → dev server e porta. Workspace deps → grafo
de dependência entre pacotes. Se existir `.codefox.yaml` no alvo, a seção `tools` é lida como
fonte primária dos comandos; o probe só infere o que faltar.

**Estágio 2 — enriquecimento por IA (1×, cacheado).** Só o que o probe não deduz: convenções,
arquitetura, o que nunca tocar. Lê `CLAUDE.md`/`AGENTS.md`/`docs/` do alvo. Papel de contexto
longo. Resultado em disco; não é recomprado por card.

### 4.3 Fontes externas

```json
"sources": [
  { "kind": "repo",   "ref": ".codefox.yaml",                       "hash": "…" },
  { "kind": "notion", "ref": "https://notion.so/…",                 "hash": "…", "fetched_at": "…" },
  { "kind": "url",    "ref": "https://raw.githubusercontent.com/…" },
  { "kind": "git",    "ref": "git@…:org/docs.git#docs/backend/" }
]
```

Notion via MCP (`notion-fetch`) → markdown cacheado em `.hii/contract/sources/<slug>.md`.
`url` é fetch cru; `git` é sparse-checkout de repo de docs.

Três regras:

1. **Fato do repo vence prosa externa.** Página dizendo "usamos yarn" não ganha de um
   `pnpm-lock.yaml` em disco. Fonte externa preenche intenção e convenção; nunca sobrescreve o que
   o probe prova.
2. **`command` e `working_dir` só de `kind: repo`.** Ver §13.1 — é fronteira de segurança, não
   preferência.
3. **Nunca busca por card.** Sync explícito, mudança de hash, ou TTL. Fonte inalcançável → usa
   cache; sem cache → contrato válido com `sources_missing: [...]` e enriquecimento vazio. Card
   não morre porque o Notion caiu.

### 4.4 Duas projeções

A mesma fonte, dois recortes — o momento de construir e o de cobrar são distintos
(`.shared/memory/feedback_contract_two_moments_local.md`: *"construção não cobra padrão"*).

| | **Criação** (prompt do builder) | **Revisão** (prompt do gate) |
|---|---|---|
| Contém | stack real, comandos do pacote afetado, code-map, tokens de design, piso de segurança | invariantes, `severity`, `priorities`, `path_instructions`, `pre_merge_checks`, barra de qualidade |
| Tamanho | fino | grosso |
| Razão | contrato inteiro no prompt de construção infla token e faz o builder auditar em vez de entregar | revisor sem contrato julga com os padrões errados — é o bug do `codefox-gate.ts:92` |

### 4.5 Invariantes verificáveis

Bloco `invariants` checado **deterministicamente** — script, regex ou `ast-grep` — e só o que não é
checável vai ao LLM. Reduz carga do juiz e elimina uma classe de alucinação: hoje o veredito do
modelo é a verdade final, sem ancoragem.

---

## 5. Peça 2 — de-hardcode

Todo comando passa a vir do contrato, resolvido **no pacote afetado pelo diff**:

| Hoje | Alvo |
|---|---|
| `npm run build` / `npm test` fixos | `contract.commands.{build,test,lint,typecheck}` do pacote afetado |
| `npm run dev -- --port` com flags Vite | `contract.dev` por pacote, sintaxe do framework detectado |
| `hasBuildScript` lê só a raiz | resolve o pacote pelo diff via grafo de pacotes |
| prompt afirma "Vite + Vue 3" | prompt cita `contract.stack` |
| gate cobra "nunca React" | gate cobra o contrato de revisão do alvo |
| `runCmd` coletado e nunca lido | vira campo do contrato, ou é removido |

Daqui vem o ganho de velocidade: teste e lint rodam **só nos pacotes afetados e seus dependentes**,
não na suíte inteira do monorepo.

**Fail-closed.** Probe inconcluso → `HALTED` dizendo exatamente o que faltou. Nunca chutar `npm`.

---

## 6. Peça 3 — mapeamento profundo e o perfil `micro`

A classe dominante de card (001–019: título do hero, rodapé, selo, botão voltar-ao-topo) é mudança
localizada. Hoje cada uma paga exploração de agente caro para descobrir *onde* mexer e só depois faz
um patch de três linhas.

Três índices em `.hii/index/` (derivados, gitignorados), **consultados sem LLM**:

1. **Texto visível → `arquivo:símbolo`.** Índice invertido dos literais de UI (templates, JSX,
   i18n). "Remover o texto X" vira lookup.
2. **Elemento renderizado → `arquivo:linha`, do runtime.** O Playwright já roda (`preview.ts:70`);
   com atribuição de origem no dev server (plugins que injetam `data-*` com arquivo/linha), o
   snapshot do DOM entrega a origem medida, não inferida.
3. **Estilo computado → regra que o define.** Via CDP (`CSS.getMatchedStylesForNode`): qual folha,
   qual linha, qual token — ou classe utilitária no template.

Nascem no `contract sync`; invalidados por hash de arquivo. O `touched.tsv` do `.shared/code-map/`
é o padrão de captura por hook; o `index.md` curado continua sendo a camada semântica ("onde vive o
fluxo X"), complementar a esta, que é mecânica.

`analyze.ts` ganha o perfil **`micro`**: pula spec, layout e polimento; vai a lookup → patch mínimo
→ preview → gate, com modelo barato, porque a parte difícil já foi resolvida sem IA.

---

### 6.1 Layout-first sem contrato (monofile)

Para card visual **subjetivo**, o passe de LAYOUT **não segue contrato nenhum**. Definição exata,
e cada cláusula é verificável:

- **Não segue contrato.** Nem o de criação, nem o de revisão. Sem invariantes, sem teto de 350
  linhas, sem tipagem estrita, sem regra de comentário. Só o **piso de segurança** permanece.
  É a regra já registrada em `.shared/memory/feedback_contract_two_moments_local.md`:
  *"construção não cobra padrão (só piso de segurança)"*.
- **Mínimo, nos frameworks e linguagens que já existem no projeto.** Não é HTML descartável à
  parte: é Vue/React/o-que-o-contrato-detectou, renderizando no **dev server real** do alvo.
- **Monofile, mesmo.** Um arquivo. Sem quebrar em componentes, sem extrair composable, sem arquivo
  de tipos separado.

**Por que "na stack do projeto" não é conveniência, é requisito.** O screenshot aprovado vira a
barra do §8.2. Se o layout fosse HTML solto, a implementação refinada em Vue nunca bateria com ele
— fonte, aplicação de token e engine de layout diferentes — e a barra voltaria a ser inalcançável,
reintroduzindo exatamente o problema do D15. Renderizar na stack real é o que torna a barra
legítima.

**Por que monofile é a definição certa de "mínimo".** "Faça simples" não é checável; "um arquivo"
é. E dá fronteira inequívoca ao descarte: o refinamento **apaga** o arquivo e reimplementa, não
edita.

**Marcador próprio, não `hicode:allow-monolith`.** O arquivo carrega uma diretiva dedicada
(`hicode:layout-draft`) que (a) relaxa os hooks `block-monolithic`, `block-any-unknown`,
`block-comments` e `block-derived-state` naquele arquivo e (b) o identifica para o gate de PR.
Reusar `hicode:allow-monolith` seria armadilha: aquela diretiva existe para **permitir
permanência** (dívida técnica assumida), e o rascunho de layout é o oposto — não pode sobreviver.

**Argumento econômico.** Hoje a rejeição de preview cai em `correct.ts:64` → `redoPreview` → refaz
a implementação inteira. Num card visual isso significa pagar lógica, integração e estado de novo
porque o espaçamento não agradou. Com layout desleixado, a rejeição mais provável — a estética —
acontece quando só existe markup jogado.

**O efeito colateral que resolve o D15.** O screenshot do layout **aprovado** vira a barra nomeada
do Gauntlet (§8.2) para o passe refinado: a implementação sob contrato tem de bater visualmente com
o layout aprovado, em A/B cego contra aquele screenshot.

Isso conserta o buraco do Gauntlet. A barra do desenho original é *deliberadamente inalcançável* —
por isso o loop nunca termina. Esta barra é **alcançável por construção**: foi renderizada pelo
passo anterior e aprovada por um humano. O crítico não tem como inventar a comparação, e o loop tem
condição real de vitória.

**Dois riscos travados por desenho:**

1. **Rascunho vazando para produção.** O refinamento **reimplementa** sob contrato, tendo o
   screenshot aprovado como especificação e o monofile como referência de intenção — não como base
   a editar. O arquivo é apagado. Paga a implementação duas vezes, e é barato porque o primeiro
   passe nasceu descartável.
2. **Relaxamento virando bypass permanente.** Os hooks ficam desligados naquele arquivo, então o
   motor precisa **impedir que um card chegue ao PR com o arquivo `hicode:layout-draft` vivo**.
   Refinamento obrigatório, não opcional — e o check é trivial porque é um arquivo só, marcado.

**Ajuste no analisador.** O corte deixa de ser visual × não-visual e passa a ser **localizado ×
subjetivo**:

| Card | Rota |
|---|---|
| "remover o negrito", "tirar esse texto", "alinhar esse elemento" | `micro` — índice (§6) + patch, sem layout |
| "deixar o card de stars mais chamativo", "melhorar o hero" | visual **subjetivo** — layout desleixado → aprovação → refino sob contrato |

## 7. Peça 4 — malha multi-IA via OmniRoute

### 7.1 O que o gateway assume

Proxy local OpenAI-compatible (`localhost:20128/v1`), MIT, self-hosted, SQLite, sem telemetria — o
broker é nosso. Assume, sem código no motor: catálogo vivo de modelos, custo real por resposta
(`X-OmniRoute-Cost`), 19 estratégias e combos nomeados, fallback em três camadas (circuit breaker →
cooldown → model lockout), teto de custo por request (`x-omniroute-budget-usd`), estratégia
`fusion` (painel + juiz) e engines de compressão.

O **RTK** (60–90% em saída de shell/build) é estritamente melhor que o `.slice(0, 1500)` que
`finish.ts:41,64` aplica hoje no stderr antes de mandar para a IA.

Ponto-chave: claude CLI, Codex CLI e OpenCode aceitam base URL customizada, então o gateway senta
**por baixo** dos adapters existentes. O motor mantém tool loop, edição de arquivo e agentes Nexus;
`AiProvider` não muda.

### 7.2 Três travamentos

1. **O adapter `claude` continua direto na Anthropic.** Roteá-lo pelo gateway não ganha nada (é
   assinatura) e arrisca o `supportsAgents` — o `Task` despachando limpio/vitro/escudo é maquinaria
   do claude CLI afinada em modelo Anthropic.
2. **`model: "auto"` puro, nunca.** Roteamento não-determinístico quebra reprodutibilidade e a
   semântica de `resume_from`. Combo **pinado por classe de tarefa**, e o modelo resolvido (de
   `X-OmniRoute-Decision`) gravado no log do card e em `runs/*.json`.
3. **Compressão por classe.** RTK na saída de build/test: sim. Caveman/Ultra no **diff que vai ao
   revisor**: não — revisor julgando evidência comprimida invalida a regra de ancoragem em
   `file:line`. Gate e review com compressão `off`.

Mais: allowlist de provedores por classe (diff de repo privado não vai para free tier arbitrário);
health check no start (`omniroute doctor`); e bypass `HICODE_ROUTER=off` para provedores diretos —
sem ele, gateway fora do ar significa todo card em HALTED.

### 7.3 Escolha de IA e esforço por tarefa

Router como default, override explícito. No frontmatter do card:

```yaml
ai: auto              # auto (combo da classe) | claude | codex | deepseek/deepseek-r1 | <combo>
effort: medium        # low | medium | high | max
ai_steps: testes=deepseek-r1, seguranca=claude, limpeza=qwen3-coder
pilha: off            # D20 — só o humano liga; motor sugere, nunca ativa
layout: off           # D20 — idem; liga o passe monofile sem contrato (§6.1)
```

`ai_steps` é o que torna o multi-IA real — hoje todos os steps dividem um único
`HICODE_STEP_PROVIDER`.

`effort` mapeia para quatro alavancas coerentes, porque só alguns modelos aceitam
`reasoning_effort`: (a) `reasoning_effort` onde existe; (b) tier do modelo no claude; (c) tamanho do
painel de revisores — `low` = 1 revisor barato, `max` = `fusion` com 3 lentes cross-família;
(d) `MAX_REAJUSTE`.

Mesmos campos no painel Nuxt, com defaults por env.

### 7.4 Onde cada IA rende

| IA | Papel | Razão |
|---|---|---|
| claude | implementação com agentes Nexus, arquitetura, conflito de merge, gate final | único com `supportsAgents` |
| codex | reajuste de build/lint/tipos, backend | loop erro-compilação; sandbox próprio |
| deepseek | crivo secundário, planner, fatiamento, risco | raciocínio longo barato; acha defeito, edita mal em massa |
| qwen3-coder | `pura`, renomes, testes repetitivos, classify, sumarização | volume mecânico, custo/token ótimo |
| kimi | gerar/atualizar contrato lendo o repo, gate de diff grande | contexto longo resolve o truncamento de 60k |
| ollama local | classify, eval, sumarização | custo 0, já não edita |

---

### 7.5 Roteamento ciente de capacidade (restrição dos plugins)

Plugins, skills e MCP são features do **Claude Code**: só disparam quando o papel roda no adapter
`claude` (`supportsAgents=true`). Com `codex`, `opencode` ou `ollama`, **nada disso ativa**.

Isso colide com §7.3: rotear `implement` para um modelo barato via opencode desliga, em silêncio,
o context7 (docs atuais da lib), o superpowers (método: plan → TDD → debugging sistemático) e o
impeccable (piso visual). A economia por token seria paga em alucinação de API e retrabalho — o
custo que o roteamento tentava cortar.

Regra: cada classe de tarefa declara o que exige (`needs: [agents, mcp, vision, tools]`) e o router
só considera candidatos que satisfaçam. Classe dependente de plugin é elegível apenas a `claude`.

E **nunca fingir que rodou**: se o provedor escolhido não ativa um plugin previsto, isso vai
explícito para o log do card e para a trilha de auditoria (§13.2).

### 7.6 Contexto e cache — a maior alavanca de custo

**Curadoria de contexto.** `correct.ts:57-61` monta o histórico de *todas* as tentativas anteriores
(cada uma cortada em 200 chars) e prefixa no prompt do redo; e todo `implement()` reenvia regras +
memória de projeto + brief de design + refs. Cresce a cada rejeição, sem seleção. Selecionar /
resumir / descartar ataca a causa; comprimir no transporte (RTK, §7.1) trata o sintoma. Os dois
valem — a curadoria primeiro.

**Overhead da CLI.** `claude -p` e `codex exec` injetam o próprio system prompt, os schemas de
tools e fazem turnos internos que são cobrados. Para papéis sem tool loop — gate, eval, classify,
verify, clarify — a chamada HTTP direta (ou via gateway) elimina esse overhead inteiro,
independentemente do modelo escolhido. É um argumento de custo mais forte que a diversidade de
modelo para justificar a rota de julgamento pelo gateway.

**O contrato é o que habilita o prompt caching.** O contrato de criação + regras + code-map formam
um **prefixo estável, idêntico em todos os cards do mesmo repo**. Com chamada direta e prompt
caching (e a estratégia `cache-optimized` do gateway, que fixa prefixos reutilizáveis na mesma
conta), esse prefixo passa a ser cacheado em vez de recomprado por card. Hoje é impossível: o
prompt é montado ad-hoc em `agent.ts:42-56` e varia a cada chamada.

O contrato deixa de ser só correção e vira a peça que habilita a maior economia estrutural do
motor — o que reforça a ordem dos incrementos (§16).

## 8. Peça 5 — revisores

1. **Quem revisa nunca é da família de quem escreveu.** Um `if` no router; é o ganho de qualidade
   mais barato do documento.
2. **Painel com lentes distintas** (correção / regressão-e-costura / segurança-e-contrato), tamanho
   pelo `effort`, **mediana** — não média: mediana resiste a um juiz outlier.
3. **Toda dedução ancorada** em `file:line` real ou check que falhou. Dedução sem âncora
   verificável não bloqueia; vira nota no corpo do PR.
4. **Falha de parsing ≠ reprovação.** Separar `unparseable` de `BLOCKED`; re-perguntar com prompt
   mínimo em modelo com JSON-mode antes de contar tentativa.
5. **Diff grande:** chunk por arquivo com mapa global (nomes + stat) em todos os chunks, ou rota de
   contexto longo. Nunca truncar no meio silenciosamente.

### 8.1 Rubrica de qualidade (meta 9/10)

Dimensões com peso: cumpre o objetivo (evidência: E2E verde) · fidelidade visual vs referência ·
invariantes determinísticos (automático, 0 token) · cobertura dos cenários do spec ·
regressão/costura entre steps · legibilidade.

**Política aprovada — meta com platô e entrega anotada:** o loop de polimento roda enquanto a nota
**sobe**. Estacionou (sem ganho entre tentativas) → para, abre o PR e lista as deduções ancoradas no
corpo. Bloqueio duro fica reservado a dedução de severidade *blocker* (bug, regressão,
vulnerabilidade).

Razão: calibração de LLM entre 8 e 9 é ruído. Com `MAX_REAJUSTE=2`, meta literal faria um card que
estaciona em 8 queimar três ciclos completos de polimento para terminar em `HALTED`.

### 8.2 Gauntlet Loop — julgar por comparação, não por nota

**Origem.** Matt Shumer, julho/2026. O prompt de três parágrafos que produziu o "Claude of Duty"
(FPS em Three.js/WebGL2, ~55k linhas, 11 subsistemas, assets gerados em runtime) foi publicado em
25/07/2026; a técnica foi nomeada dias depois. Conceito com semanas de idade — o que exige tratá-lo
como promissor e não-validado, não como prática estabelecida.

**Mecânica.** Objetivo + **barra de qualidade nomeada** ("construa X no nível de REFERÊNCIA");
decomposição em **partes julgáveis independentemente**; builders separados por parte; **crítico
severo de contexto fresco** compara com a referência em **A/B cego** e **escolhe** (binário, não
pontua); parte que perde volta para outra rodada.

Requisitos da barra: **nomeada** (coisa específica, não categoria), **buscável** (o crítico
consegue abrir, rodar ou screenshotar) e **comparável** (as duas versões cabem lado a lado).

#### A taxonomia — e onde o hicode se encaixa

A literatura que se formou em volta situa o Gauntlet dentro de **AI Loop Engineering**: *"projetar
um sistema em que a IA age, observa o resultado, avalia contra um padrão definido, melhora o
trabalho e repete até uma condição de sucesso, fronteira de segurança, orçamento ou regra de
escalonamento parar"* — que é a definição do `METODOLOGIA.md` deste repositório.

E distingue dois tipos:

| | **Gauntlet guiado por prompt** | **Loop recorrente engenheirado** |
|---|---|---|
| Unidade | um artefato ambicioso | processo contínuo entre tentativas |
| Setup | pouco código, se o harness der tools | persistência de estado, gatilhos, permissões |
| Serve para | jogo, site, design, capítulo | triagem de issue, investigação de CI, testes noturnos |

**O hicode é a coluna da direita; o Gauntlet é a da esquerda.** Integrar = embutir um padrão de
uma coluna dentro do sistema da outra. A taxonomia valida explicitamente a síntese abaixo.

#### O problema da barra inalcançável — a ressalva que mais importa

Shumer é honesto sobre o próprio resultado: *"a barra de qualidade era uma bússola, não a nota
final"* — o jogo **não** alcançou paridade com Call of Duty. E uma das implementações descreve o
método como *"blind A/B against an **unreachable** reference"*.

Isso reinterpreta o "sai ao vencer": **com barra deliberadamente inalcançável, a vitória nunca
acontece** — daí *"You are the brake. The loop will not finish on its own."* A barra existe para
puxar qualidade para cima, não para ser atingida.

Para um motor autônomo isso é inaceitável como está: barra inalcançável + sem terminação =
exaustão de orçamento garantida. Logo, no hicode, **uma de duas condições é obrigatória**: a barra
é *alcançável* (referência real e batível), **ou** o loop é limitado por teto de rodadas por parte.
Não é preferência — é a diferença entre um loop que termina e um que só para quando o dinheiro
acaba.

Confirmação independente: a adaptação de produção mais detalhada que encontrei (Nil Ni, QuizGen.ai)
adicionou exatamente **"round caps per surface to prevent infinite churning"** ao rodar o padrão
num produto real.

#### O que a adaptação de produção acrescenta

- **Decompor por _superfície_, não por arquivo** (aquisição, signup, criação, uso central,
  billing, conta). Casa com o card do hicode melhor que uma lista de arquivos.
- **Referências por qualidade, não uma só**: Duolingo para *momentum*, NotebookLM para
  *confiabilidade*, Linear para *precisão*. Cada dimensão tem a sua barra.
- **Evidência casada ao tipo de risco**: UI → screenshots claro/escuro, mobile/desktop; API →
  testes de contrato; conteúdo → verificação de citação.
- **Regras duras como invariantes**: "sem números falsos, depoimentos fabricados, alegações sem
  suporte" — é o bloco `invariants` do contrato (§4.5).
- **Barra dolorosamente concreta**: dimensões exatas de screenshot (1440 desktop, 390 mobile),
  dados de produção e não fixtures, tokens de design inegociáveis.
- **Formato de veredito explícito**: FAIL com correções específicas, ou "SHIP IT".

#### Os dez modos de falha vs. o hicode

A literatura de loop engineering lista dez. Quatro o motor já resolve **por desenho**; seis são
exatamente o que este documento corrige:

| Modo de falha | Estado no hicode |
|---|---|
| Progresso auto-reportado em vez de teste observável | **já resolvido** — gate lê exit code em disco |
| Colisão de agentes por isolamento ruim | **já resolvido** — worktree por card |
| Humano abdicando do julgamento | **já resolvido** — merge humano, perguntas anti-rendição |
| Objetivo subjetivo sem evidência inspecionável | **já parcial** — preview + screenshot |
| Builder como único juiz | §8.1 — revisor de família cruzada |
| Sem fronteira de orçamento → loop infinito | §2.2 (custo cego) + §10.6 |
| Repetição sem adaptação | §2.2 — o retry repete a mesma receita |
| Contexto apodrecendo | §7.6 — curadoria |
| Métrica gameável | guarda anti-clone, abaixo |
| Permissão larga demais | §13.2 — `opencode --auto` |

#### Onde entra

Substitui o estágio SCORE (§3), não se soma. Em card visual roda também no LAYOUT, onde a barra já
existe: o motor já baixa as imagens de referência (`refs.ts`) e já tira screenshot do preview
(`inspectPreview`) — **a maquinaria do A/B cego visual está no repo e nunca foi usada como juiz**.
Opt-in por `effort: max` (§7.3); é a forma mais cara do desenho.

Convergência: "partes julgáveis independentemente" é critério de decomposição melhor que "partes
construíveis independentemente" — e é o mesmo que faz uma fatia boa de pilha (§14: cada fatia
compila sozinha).

**Por que substitui a rubrica.** A rubrica de §8.1 tem problema de calibração (entre 8 e 9 é ruído)
que mitigamos com detector de platô. O A/B cego contra artefato concreto **não tem calibração para
derivar** — resolve na raiz o mesmo problema. E responde melhor ao objetivo "resultado que
impressiona revisor": nota absoluta não impressiona; vencer referência nomeada, sim.

#### Adições do motor, que a técnica crua não cobre

1. **Gate de validação da barra**, determinístico e barato: nomeada? o motor consegue de fato
   buscá-la/rodá-la/screenshotá-la? comparáveis? **alcançável ou com teto de rodadas?** Se não
   valida, não entra em modo gauntlet — cai na rubrica. Mata o modo de falha nº1 (barra vaga →
   crítico inventa a comparação e aprova tudo) antes de gastar token.
2. **Cegar mecanicamente, não por instrução.** "Compare às cegas" no prompt é teatro: os artefatos
   vazam qual é qual (caminhos, nomes de arquivo, impressão digital do framework, nossos tokens).
   Cegar de verdade = randomizar a ordem A/B por comparação, remover caminhos/nomes, normalizar
   dimensão dos screenshots.
3. **Guarda anti-clone.** Crítico obrigado a escolher é gamificável por um builder que copia a
   referência. O diff continua tendo que cumprir o objetivo do card e os invariantes; se a
   referência é página de terceiro, vencer não pode significar clonar.

#### Quando NÃO usar

A própria literatura: *"faça a tarefa à mão primeiro quando você ainda não consegue descrever o
sucesso"*; evite autonomia ampla quando o erro é caro ou irreversível, quando o agente não observa
o resultado real, ou quando **uma passada humana cuidadosa é mais barata que construir e revisar o
loop**. A adaptação de produção é explícita: não serve para correção pequena, onde montar "uma
corte de design em miniatura" é puro overhead.

No hicode isso mapeia direto: card de perfil **`micro`** (§6) **nunca** entra em modo gauntlet.

#### Caveat de generalização

A cobertura do "Claude of Duty" registra suspeita de **contaminação de dados**: o modelo
provavelmente se apoiou em milhares de exemplos documentados de FPS em Three.js. Isso não invalida
a capacidade de montagem do agente, mas impede extrapolar o resultado do demo para domínio
proprietário — onde não existe corpus equivalente. Motivo a mais para a barra ser *alcançável* e
medida, não aspiracional.

Fontes: [robonuggets/gauntlet-loop](https://github.com/robonuggets/gauntlet-loop) ·
[duolahypercho/gauntlet-loop](https://github.com/duolahypercho/gauntlet-loop) ·
[AI Loop Engineering & Gauntlet Loops (2026)](https://www.thepromptindex.com/ai-loop-engineering-gauntlet-loop-guide.html) ·
[Decrypt — Claude of Duty](https://decrypt.co/374560/dumbest-ai-prompt-claude-beat-careful-game-design) ·
[Nil Ni — Gauntlet Loop no Claude Code](https://www.nilni.com/blog/gauntlet-loop-claude-code-prompt) ·
[Enterprise DNA — repercussão](https://enterprisedna.co/resources/ai-pulse/ai-pulse-2026-07-28-matt-shumer-s-single-prompt-three-js-fps-claude-of-duty-trig/)

---

## 9. Peça 6 — E2E com Playwright

Novo `gate: "e2e"`. O qa-tester deriva os specs dos **Cenários** do spec (o `verify: sql|test|manual`
do GIVEN/WHEN/THEN vira o alvo do teste) — é o elo hoje inexistente entre a fase de spec e a de
teste. Roda headless no worktree contra a porta de `previewPort(id)`. Exit code é o gate.

**Flake ≠ defeito.** Spec que falha é rodado de novo isolado; só falha reproduzível gateia. Sem
isso, E2E se torna a maior fonte de HALT do sistema.

Requer contrato: existe Playwright no alvo? qual comando? qual porta?

---

## 10. Peça 7 — integridade, retomada e event stream

1. **`patchCard` atômico com lock** (tmp + rename, `.lock` com `O_EXCL`) **e lock de instância
   dentro do `runner.ts`**, não só no shell. O card é a única fonte de verdade e hoje tem dois
   escritores sem proteção, e dois motores são possíveis via `hii run`. É a correção que não pode
   ser postergada: as outras desperdiçam tokens, esta corrompe estado.
2. **Execução durável — comprar, não escrever.** Card = workflow durável (DBOS-TS embarcado,
   SQLite): fases = *activities*; aprovação de preview e porta do PR = *signals*; HALT, retry,
   timeout, heartbeat e resume pós-crash nativos. Substitui o `reconcileStranded`, o `resume_from`
   manual e o checkpoint por nó escritos à mão.

   **Ressalva que a decisão exige:** mesmo com engine durável, o card continua sendo o artefato
   **humano e editável** (o painel escreve nele; você edita à mão). A divisão é: o engine durável
   é dono do **estado de execução**; o card é a **projeção humana**, derivada e sincronizada. Sem
   essa separação viram duas fontes de verdade — pior que uma frágil. E a escrita atômica do item
   1 continua necessária.

   Temporal (servidor, ops próprio) fica para quando houver multi-node real.
3. **Cache de `allCards()` por tick**, invalidado em escrita (`queue.ts:50-53`).
4. **Event stream normalizado** — `runs/<id>.events.jsonl`, append-only:
   `{ts, card, phase, step, agent, provider, model, kind, payload}`. Os três adapters podem emitir
   (`claude-stream.ts` já parseia stream-json; codex `--json`; opencode `--format json`). Uma fonte
   consumida por TUI, painel Nuxt e Slack, em vez de três verdades sobrepostas.

   Efeito colateral valioso: hoje cada evento escreve uma linha de prosa no corpo do card via
   `patchCard`, reescrevendo o arquivo inteiro — o card cresce sem limite e é justamente o arquivo
   com risco de corrupção. Eventos de alta frequência migram para o jsonl; no card ficam só as
   transições de estado.

   Enquadramento: o Log de Estado do card **já é** um event stream. Com o engine durável (item 2),
   o jsonl deixa de ser observabilidade e vira a **fonte**; card e dashboard são projeções.
5. **Timeout por classe de step**, não global.
6. **Orçamento cortando antes de gastar** (estimativa pelo tamanho do prompt), por card e por dia.
   `x-omniroute-budget-usd` dá um segundo teto independente no gateway.
7. **Taxonomia de HALT** — precisa-de-humano vs retomável — para o loop saber o que pode tentar
   sozinho.

---

## 11. Peça 8 — CLI, TUI e modo workflow

1. **`hii tui`** — tela cheia: coluna esquerda com os cards (estado, step atual, modelo resolvido,
   custo, tempo no step); painel direito com o stream vivo do card selecionado; rodapé com ações por
   tecla (aprovar preview, rejeitar, pausar, retomar de um step, halt). Redraw **diferencial**, não
   `\x1b[2J` — o `watch` de hoje destrói scrollback e pisca.
2. **`hii tui --tmux`** — uma janela tmux com um pane por card ativo, cada um seguindo seu event
   stream. Zero renderização custom; usa o multiplexer existente. É o "terminais de IAs" literal.
3. **Modo máquina** — `hii run <id> --json` emitindo NDJSON no stdout e **exit code com taxonomia**
   (0 = PR_OPEN; códigos distintos para HALT-precisa-humano, HALT-retomável, orçamento, gate). Hoje
   `runner.ts:26` sai sempre com 0, então nenhum workflow consegue ramificar.

---

## 12. Peça 9 — `hii doctor` e canal humano

Preflight de conexões. O argumento é `finish.ts:250`: hoje o motor descobre que `gh pr create` não
tem permissão **depois** de rodar o pipeline inteiro e pagar por ele.

| Verificação | Como | Se falhar |
|---|---|---|
| IAs / router | `omniroute doctor` + `/v1/models`; `claude`/`codex`/`opencode` presentes e autenticados; ollama `/api/tags`. Reporta qual modelo cada classe resolve agora | fail-closed |
| GitHub | `gh auth status` + `gh repo view` conferindo **push e PR**, não só login | fail-closed |
| Notion | MCP alcançável e páginas-fonte do contrato buscáveis | fail-open (cache + `sources_missing`) |
| Slack | MCP + canal gravável | fail-open |

A distinção fail-closed/fail-open impede o doctor de bloquear trabalho por causa de um Slack fora
do ar.

**Slack não é enfeite:** é o que torna o loop autônomo. Hoje o motor estaciona card em `CLARIFY`
(`execute.ts:101`) ou `PREVIEW` e ninguém é avisado. Com o canal, CLARIFY, aprovação de layout,
aprovação de preview, HALTED e PR_OPEN viram mensagem com link. O loop roda sozinho porque sabe
chamar o humano.

Roda em três momentos: `hii doctor` manual; start do daemon (recusando modo autônomo se o
obrigatório falhar); por card, cacheado com TTL.

---

## 13. Guardrails e governança

### 13.1 Comandos só de dentro do repo

O contrato carrega comandos. Se o contrato pode vir de um link do Notion, **uma fonte externa
editável injeta shell no daemon**. O próprio `codefox.template.yaml` avisa que os comandos executam
localmente e que mudanças no arquivo são sensíveis.

Regra imposta no loader: `command` e `working_dir` são aceitos **apenas** de `kind: repo` (in-tree,
passou por code review). Fonte remota contribui prosa e intenção; as chaves executáveis são
descartadas **na ingestão**, não filtradas depois.

### 13.2 Demais

- **`opencode --auto` (`opencode.ts:17`) é o elo fraco** — auto-aprovação sem allowlist, ao
  contrário de claude (`--allowedTools`, `claude.ts:30`) e codex (`--sandbox workspace-write
  -a never`, `codex.ts:17`). Ou ganha restrição equivalente, ou fica fora do loop autônomo.
- **Sandbox vira trava, não lembrete.** `CLAUDE.md` proíbe 24/7 antes do container; o motor deve
  **recusar** modo autônomo sem a flag de sandbox.
- **Gate de quota** reaproveitando `.shared/long-run/check-usage-gate.sh` (para em 90%).
- **Kill switch por arquivo** (`cards/PAUSE`) checado em `tick()` — pausa a frota sem matar o daemon
  no meio de uma escrita.
- **Trilha de auditoria** — cada chamada grava provedor + modelo + effort + custo resolvidos. Com
  múltiplas IAs, sem isso não existe governança.
- **Merge continua humano.** Nada neste documento muda isso; o motor para em `PR_OPEN`.

---

## 14. Entrega fatiada (stacked PRs)

O `/pilha` já tem a mecânica: git nativo `--update-refs`, topologia fora do repo, PRs numerados
`[N/total]` com "Depende de #X", `restack`.

**Decisão: fatiar ANTES, como DAG de cards** — não como corrente, e não cortando o diff no fim.

**Ativação é humana** (D20): `pilha: on` no card, default `off`. O motor **propõe** a decomposição,
você **aprova** — é o `PLAN_APPROVED`, estado que já existe na máquina — e só então materializa.

**A premissa que estava errada.** "Pilha serializa" assume que a pilha é uma cadeia. Não é:
decomposição típica é `fatia-00 base → N irmãs → integração opcional`. Árvore rasa. As irmãs não
dependem umas das outras, então rodam **em paralelo**, cada uma com worktree e preview próprios,
governadas por `MAX_CONCURRENCY`. Só as genuinamente dependentes empilham.

- **`fatia-00` base:** tipos, contratos e arquivos compartilhados por natureza (barrel, router,
  arquivo de tokens). Roda primeiro, é curta, e é sobre ela que as irmãs partem.
- **Irmãs:** cards filhos com `depends_on: <base>`, despachados juntos. A fila já despacha por
  status (`queue.ts:57`) — o paralelismo sai quase de graça.
- **Entrega:** PRs numerados `[N/total]` com "Depende de #X", ordem de merge 00 → N, merge humano.

**Por que não fatiar depois.** Cortar o diff no fim exige guard de file-set, planner de partição,
detecção da fatia base, loop de reparo, agrupamento de patches por rótulo, ordenação de dependência
entre partes, build cumulativo e montagem de histórico. Fatiar antes exige `depends_on`, branch a
partir do pai, despacho paralelo e `restack` — cerca de um quinto do trabalho. Além disso:

- a **aprovação da decomposição acontece antes de gastar**; fatiando depois, uma partição errada só
  aparece com N builders já pagos (era a razão de existir do R7, que deixa de existir);
- **entrega parcial** é preservada: se a parte 3 falha, 00–02 já são PRs;
- nada de reescrita de histórico, nunca.

**Custo honesto desta escolha:** N cards = N overheads de pipeline (N clarifies, N previews,
N gates) em vez de um. Mitiga-se com cards filhos herdando contrato/spec/clarify do pai e com o
analisador pulando fases inaplicáveis — mas não zera. É o argumento real do outro lado.

**Fallback documentado — fatiar depois:** quando a decomposição **não é conhecível antes** ("polir
o produto inteiro", onde as superfícies só aparecem explorando), um card explora, faz fan-out e
corta na entrega, com a mecânica acima. É exceção, é mais caro, e não é incremento agora.

Nota: `syncWithBase` (`finish.ts:74`) usa **merge**; num stack isso quebra a pilha — precisa virar
rebase/`restack` quando o card faz parte de uma.

---

## 15. Riscos e contramedidas

**Princípio.** A maioria destes riscos não se elimina — converte-se. O que se elimina é a *classe*:
transformar "falha cara, tardia e silenciosa" em "falha barata, imediata e visível". Seis dos dez
seguem o mesmo padrão: **um check determinístico e barato no ponto de uso, antes de pagar**.

| # | Risco | Contramedida | Resíduo |
|---|---|---|---|
| R1 | custo multiplica | contabilidade primeiro; corte pré-gasto por classe; teto duplo | permanece — só limitável |
| R2 | E2E flaky | quarentena de spec instável | vira manutenção |
| R3 | gateway como dependência | candidato direto no fim da fila + circuit breaker | degradação de custo |
| R4 | roteamento não-determinístico | pinar modelo por card + replay | eliminado p/ reprodução |
| R5 | índice apodrece | verificar no ponto de uso | vira cache miss |
| R6 | fonte externa velha | TTL visível + staleness declarada no PR | eliminado o silêncio |
| R7 | ~~partição do fan-out errada~~ | **deixou de existir** com D17 — a decomposição é aprovada por humano antes de gastar | só volta no fallback de fatiar-depois |
| R8 | rascunho de layout vaza | `hicode:layout-draft` no arquivo; PR recusa se o arquivo marcado sobreviver | eliminado |
| R9 | A/B "cego" que não é cego | cegar mecanicamente + sonda de calibração | ver abaixo |
| R10 | duas fontes de verdade | engine dono do estado; card é projeção com geração | eliminado |

**R1 — a ordem importa mais que o teto.** Único risco cuja falha é lenta, invisível e cumulativa:
os outros falham alto (card para, gate bloqueia, guard recusa); um pipeline 5× mais caro não dá
HALT, drena em silêncio. E hoje o motor **não consegue ver** — `codex.ts:63` e `ollama.ts:47`
reportam `cost: 0`, então `CARD_BUDGET_USD` é decorativo. Logo: **corrigir a contabilidade antes de
instituir qualquer teto.** Teto sobre número errado é teatro de governança. Orçamento por classe de
card só depois de medir, com números de medição — não de estimativa.

Redutores estruturais (multiplicativos, não aditivos): cache do prefixo estável (§7.6), escopo por
pacote afetado (§5), via rápida `micro` (§6), papéis de julgamento fora da CLI (§7.6), curadoria de
contexto (§7.6).

**R2 — quarentena, não gate não-bloqueante.** Spec que falha e passa em rerun isolado é marcada
flaky, continua rodando e **nunca gateia**, com contador. Só falha reproduzível bloqueia. Se a taxa
de flake do alvo passar do limite, o gate se auto-desliga e reporta em vez de derrubar cards.

**R5 — o índice deixa de poder errar.** Hash diz que o arquivo mudou, não que a entrada ficou
errada. Se o motor **confere no uso** que o texto ainda está naquele símbolo antes de entregar ao
agente, índice podre vira cache miss: cai na busca, reindexa, segue. Custo: um grep. Índice
verificado no ponto de uso nunca dá resposta errada, só resposta lenta.

**R9 — sonda de calibração.** Cegar mecanicamente ainda não diz se o crítico está julgando. Detector
barato: periodicamente, entregar a ele **duas cópias do mesmo artefato**. Preferência forte = ou o
cegamento vaza, ou o crítico é ruído — nos dois casos o veredito não vale nada. Sem essa sonda não
há como saber se o gauntlet funciona ou performa.

Este é o segundo risco que eu temo, porque produz **confiança falsa**: um verde que não significa
nada, e no qual se confiaria mais que na rubrica substituída. Risco que gera falso positivo de
qualidade é pior que risco que gera falha — a falha você vê.

**R4 — pinar por card, não por chamada.** Combo pinado por classe ainda deixa o modelo variar entre
chamadas do mesmo card. Uma vez resolvido "review" no modelo X para o card #42, todas as chamadas
de review daquele card usam X. É o que torna um HALT reproduzível, e habilita
`hii run <id> --pin-models-from <run>`.

**R7 — eliminado pela ordem, não por mecanismo.** Com D17 a decomposição é proposta pelo motor e
**aprovada por humano antes de qualquer builder rodar**; partição errada custa segundos de conversa,
não N builders pagos. O loop de reparo (guard reporta arquivo faltante → move para a fatia-00 →
re-roda só aquela parte) fica reservado ao fallback de fatiar-depois, onde a partição só se revela
durante o trabalho.

Vale como princípio geral: **mover a decisão para antes do gasto elimina o risco; mecanismo de
reparo apenas o limita.**

---

## 16. Incrementos

**0 — Os quatro críticos (antes de tudo). ✅ CONCLUÍDO em 16/08/2026.** Não faziam parte do escopo de
desenho de D1: eram correções pontuais, independiam do resto, e três delas eram pré-condição de
segurança para deixar o motor mais autônomo.

- ~~gate final fail-closed (§2.3.1)~~ — **já estava resolvido** quando este documento foi auditado
  contra o `main`: `gateOutcome` (`codefox-gate.ts:161`) faz `if (!gate.ok) return 'halt'`, e
  `withGateRetry` repete antes de decidir. Entrou pelo PR #13;
- ~~`patchCard` atômico (§2.4)~~ — **idem**: `updateCard` (`card-store.ts`) já usa `withFileLock` +
  `writeFileAtomic`. Entrou pelo PR #13;
- ~~custo cego (§2.2)~~ — PR #14. `codex` e `ollama` deixaram de devolver `cost: 0`
  incondicionalmente; `AgentResult` ganhou `costMeasured`, e o card distingue `cost_unverified` (a
  chamada não reportou) de `cost_floor` (gastou e morreu antes de reportar). O teto passou a se
  recusar a dar garantia que não tem;
- ~~lock de instância no `runner.ts` (§2.4)~~ — PR #14. Saiu do `runner-daemon.sh` e passou para
  dentro do `runner.ts`, no único ponto por onde todo caminho que despacha job passa, com aquisição
  por criação exclusiva e retomada de lock órfão;
- ~~SSRF por redirect em `refs.ts` (§2.4)~~ — PR #14. O `-L` saiu, o host passou a ser validado **a
  cada salto** e pelo **endereço resolvido**, não pelo nome — `localtest.me` é um hostname público
  real que resolve para `::1` e furava a blocklist inteira. O endereço aprovado é fixado com
  `--resolve`. Cobertura: `refs-redirect`, `refs-dns-guard`, `refs-teto-tamanho`,
  `refs-resposta-de-erro`.

Dois achados colaterais que o incremento produziu e que não estavam previstos aqui: o
`--max-filesize` não valia para resposta sem `Content-Length` (300 MB em `chunked` eram gravados com
exit 0), e resposta HTTP ≥ 400 virava "imagem de referência" entregue ao modelo com visão. Os dois
foram fechados no mesmo PR.

> **Nota de método.** Os dois primeiros itens desta lista já estavam feitos quando o trabalho começou.
> Auditar o `main` antes de executar o plano custou minutos e evitou reescrever código correto — vale
> como precondição de qualquer incremento seguinte deste documento.

**1 — Curadoria de contexto + cache do prefixo.** §7.6. Depende do contrato para o prefixo estável,
mas a curadoria do histórico de tentativas (`correct.ts:57-61`) já rende sozinha e é barata.

**2 — Contrato + de-hardcode.** §4 e §5. Sem isso, tudo o resto otimiza um motor que só serve a um
repositório, e modelos novos recebem prompt que mente sobre o alvo.

**3 — Índices + perfil `micro`.** §6. Maior ganho de custo/latência na classe dominante de card.

**4 — Router + `ai`/`effort` + revisor cross-família.** §7 e §8.1–8.5.

**5 — DAG, layout-first, E2E, rubrica.** §3, §8.1, §9.

**6 — TUI, doctor, Slack, loop autônomo governado.** §11, §12, §13.

**7 — Fatiamento em pilha.** §14.

---

## 17. Decisões registradas

| # | Decisão | Razão |
|---|---|---|
| D1 | Escopo do primeiro desenho: contrato + de-hardcode | tudo o mais depende do contrato |
| D2 | Meta 9/10 com platô e entrega anotada; bloqueio duro só em severidade *blocker*. **É a política default**, aplicada a todo card que não entra em modo gauntlet | calibração entre 8 e 9 é ruído; meta literal queima o orçamento para terminar em HALTED |
| D2b | Os dois mecanismos coexistem: gauntlet em `effort: max` **com barra válida**; rubrica no resto | o gauntlet custa caro e depende de barra concreta — sem ela degrada para "crítico inventa a comparação e aprova tudo"; e para refactor/backend/deps muitas vezes não existe referência nomeada |
| D3 | OmniRoute como default de roteamento, com claude direto na Anthropic | preserva `supportsAgents`; separa domínios de falha e de billing |
| D4 | Combo pinado por classe + modelo resolvido registrado; nunca `auto` puro | reprodutibilidade e auditoria |
| D5 | Compressão por classe; `off` em gate/review | evidência comprimida invalida a ancoragem em `file:line` |
| D6 | `command`/`working_dir` só de fonte `kind: repo` | fonte remota editável injetaria shell no daemon |
| D7 | Fato do repo vence prosa externa | doc desatualizado quebraria o comando de build de todos os cards |
| D8 | ~~Fatiamento em cards filhos, em corrente~~ **superada** — ver D17 | a premissa "pilha = corrente" estava errada: decomposição é árvore rasa, não cadeia |
| D17 | **Fatiar antes, como DAG de cards**: `fatia-00` base → N irmãs **em paralelo** → integração opcional. Só as genuinamente dependentes empilham. Fatiar depois fica como fallback documentado para decomposição não-conhecível antes | atende o paralelismo sem comprar o subsistema de corte na entrega (guard de file-set, planner de partição, reparo, agrupamento, montagem de histórico ≈ 5× o trabalho); aprovação da decomposição acontece **antes** de gastar; entrega parcial preservada; R7 deixa de existir |
| D20 | `pilha` e `layout` são **flags explícitas do card**, default `off`, ativadas pelo humano na submissão. O analisador **sugere**, nunca ativa | mesma lógica do merge humano: quem decide o que é caro de errar é a pessoa |
| D21 | **Plano aprovado por humano em todo card**, sem exceção. O artefato escala com a complexidade; o gate nunca | erro de escopo custa o run inteiro; aprovar um plano custa segundos |
| D22 | Clarify **fail-closed** e posterior ao contrato/índice: só pergunta o que o motor não descobre sozinho | JSON ilegível virando "tarefa clara" (`execute.ts:105`) é o mesmo defeito do gate final; e pergunta desnecessária treina a pessoa a carimbar sem ler |
| D23 | O plano declara **agente + skill + IA por step**, marcando explicitamente o que exige `claude` | torna a restrição D10 visível na hora da decisão, em vez de degradar em silêncio |
| D24 | Aprovação visual é **humana, no dev server**; `VISUAL_AI` off por padrão. IA nunca aprova intenção visual — só confere fidelidade ao screenshot já aprovado | quem pediu é quem sabe se é o resultado certo; à IA cabe verificar que o refino sob contrato não desviou do aprovado |
| D25 | O plano declara **custo estimado** e **como será verificado**, antes de executar | custo vira decisão consciente; critério de sucesso declarado antes impede negociá-lo depois do fato |
| D18 | Layout-first **sem contrato, monofile, na stack já existente no projeto**; refinamento **reimplementa** sob contrato a partir do screenshot aprovado, apagando o rascunho | rejeição estética passa a custar um passe barato; renderizar na stack real é o que faz o screenshot ser uma barra **alcançável por construção** para o §8.2 (resolve D15); "um arquivo" é verificável, "simples" não |
| D19 | Analisador corta por **localizado × subjetivo**, não visual × não-visual | "remover o negrito" é `micro` (índice + patch); "deixar mais chamativo" precisa do passe desleixado |
| D9 | Contrato em duas projeções (criação fina, revisão grossa) | `.shared/memory/feedback_contract_two_moments_local.md` — construção não cobra padrão |
| D10 | Roteamento ciente de capacidade; classe que depende de plugin só vai para `claude`; plugin inativo é logado, nunca silencioso | skills/MCP só disparam sob `supportsAgents`; rotear barato desligaria context7/superpowers/impeccable e pagaria em alucinação |
| D11 | Durabilidade comprada (DBOS-TS embarcado), com o card como projeção humana e o estado de execução no engine | não reescrever `reconcile`/retry/resume à mão; mas sem a separação viram duas fontes de verdade |
| D12 | Curadoria de contexto e cache do prefixo estável como alavanca primária de custo | trata a causa (contexto recomprado por card) e não só o sintoma (compressão no transporte) |
| D13 | Sem reescrita de linguagem (Go/Rust) | motor é I/O-bound: por Amdahl o ganho é ~0, e congelaria feature por semanas |
| D14 | Gauntlet Loop adotado como **mecanismo de julgamento**, com o freio vindo do motor | a técnica é "pure prompt, no harness, no state machine" e assume vigília humana; o hicode é exatamente o harness que falta |
| D15 | Barra **alcançável** ou **teto de rodadas por parte** — obrigatório | barra inalcançável (o design original) + sem terminação = exaustão de orçamento garantida; a adaptação de produção chegou à mesma conclusão |
| D16 | Modo gauntlet é opt-in por `effort: max` e **proibido** em perfil `micro` | é a forma mais cara do desenho; em mudança pontual, montar "corte de design em miniatura" é overhead puro |

### Descartados

| Item | Razão |
|---|---|
| Reescrita em Go / Rust | ver D13; os próprios artefatos admitem TS como ponte legítima |
| Temporal (servidor) agora | ops próprio sem multi-node real; DBOS embarcado cobre o que dói |
| polyfail como step | o artefato de plugins já marca "reavaliar": só agrega com fuzzer/fault-injection real; como prompt, duplica o qa-tester |

### Nota sobre os artefatos de origem

O plano de plugins (2026-07-28) projeta a fase context7 sobre um `lib/runner/stack.ts` que **não
existe no repositório**. Esse módulo é o ancestral do `contract.json` (§4) — o que confirma a ordem
dos incrementos, mas significa que aquela fase não é plug-and-play como está escrita.

O mesmo artefato afirma que `.runner.pid` "nunca é lido"; não procede — `runner-daemon.sh:28` o lê.
O furo real é outro e está registrado em §2.4.
