# 02 — Arquitetura do hicode

> Esta é a arquitetura final, **já com os ajustes do crítico de completude aplicados**
> (a síntese crua recebeu veredito `PRECISA_AJUSTES`; ver [`05-riscos-e-ajustes.md`](05-riscos-e-ajustes.md)).

## Tese

Você desenha um loop determinístico que prompta os agentes. A unidade de trabalho é um **card**
em disco (spec leve no formato delta + máquina de estados). Um **batimento externo** descobre
trabalho; por card, um **harness JS** roda o pipeline Nexus com gates Crivo, **fecha o ciclo
verde lendo exit codes reais do disco** (nunca a fala do modelo), **verifica o resultado no
banco** via MCP read-only e abre o **PR**. Única porta humana: o merge. **O repo lembra; a
conversa esquece.**

---

## 1. A espinha: o CARD

Um arquivo markdown por unidade de trabalho — `cards/<NNN-slug>.md`, versionado no git, **única
fonte de verdade editável**. Tudo mais (índice, dashboard) é **derivado** dos cards e nunca
co-autorado.

**Dois tamanhos** (ajuste anti-peso — um fix de 1 linha não precisa de 6 seções):

- **Card mínimo (`risk: low`)** — front-matter + `## Objetivo` + `## Log de Estado`.
- **Card completo (`risk: high`)** — acrescenta `## Requisitos` (cenários), `## Pipeline`,
  `## Vereditos Crivo`, `## Verificação de Banco`.

```markdown
---
id: 001
slug: add-2fa
status: EXECUTED         # estado da máquina (ver §3)
risk: high               # high | low  -> calibra rigor do Crivo e tamanho do card
branch: hicode/001-add-2fa
worktree: .claude/worktrees/001-add-2fa
created: 2026-06-29T14:00Z
updated: 2026-06-29T14:42Z
pr_url: null
cost_usd: 0.83           # acumulado, carimbado pelo harness lendo runs/*.json
attempts: 1
---

## Objetivo
Adicionar 2FA TOTP ao login.

## Requisitos            # só em risk:high — formato delta (ver §4)
### Requisito: Two-Factor Authentication
The system MUST support TOTP-based two-factor authentication.
#### Cenário: Enrolamento de 2FA   <!-- verify: test -->
- GIVEN um usuário sem 2FA
- WHEN ele ativa 2FA nas configurações
- THEN um QR code é exibido
- AND ele precisa confirmar com um código antes de ativar

## Pipeline             # preenchido na fase PLAN
| agente | gated | risk |
|--------|-------|------|
| limpio | sim   | high |
| escudo | sim   | high |
| testudo| sim   | high |

## Log de Estado        # append-only; quem escreve é o harness/hook, não o modelo
2026-06-29T14:20Z INBOX->SPECCED   /spec
2026-06-29T14:30Z SPECCED->PLAN_APPROVED crivo[plan]=APPROVED
2026-06-29T14:42Z PLAN_APPROVED->EXECUTED limpio exit=0
2026-06-29T14:45Z EXECUTED->PREVIEW screenshot+url ok
2026-06-29T15:01Z PREVIEW->PREVIEW_OK aprovado por humano

## Vereditos Crivo      # só em risk:high
[plan] APPROVED — escopo fechado, cenários testáveis.

## Verificação de Banco # só se houver cenário verify: sql
```

**Quem escreve o estado:** **não se confia na disciplina do modelo.** O hook `Stop`
(`stamp-card.sh`) e o próprio harness carimbam `status`/`updated`/`cost_usd` lendo artefatos em
disco (`cards/runs/<id>-<ts>.json`), não a narrativa do agente.

**Memória de retomada:** `~/.claude/longrun-memory.md` guarda **só o ponteiro** ("estou no card
X, estado Y, próximo passo Z"); o detalhe vive no card. Todo turno começa lendo os cards e
escolhendo o mais avançado não-bloqueado.

---

## 2. O loop em três camadas

Cada camada usa o primitivo **real** certo (confirmado na pesquisa de primitivos do Claude Code).

### Camada A — Heartbeat (descoberta, desacompanhado)

`cron`/`systemd timer` roda, em cadência (ex.: `0 7,13,19 * * *`):

```bash
claude -p "/hicode-triage" --permission-mode acceptEdits --output-format json
```

**Stateless**: cada disparo lê os cards do zero (o agente esquece, o repo lembra). Para 24/7 sem
máquina ligada → **GitHub Actions** `on: schedule: cron` com `anthropics/claude-code-action`
chamando o mesmo prompt.

> **Não** usamos `/loop` como motor: é *session-scoped*, expira em 7 dias e não tem catch-up.
> O relauncher long-run (`--resume`) fica **fora da v1** (ver corte em [`05`](05-riscos-e-ajustes.md)).

`/hicode-triage`: GC de worktrees órfãos → regenera dashboard → lê CI vermelho, issues, commits e
drift de banco (via MCP read-only) → **escreve/atualiza cards**. Só promove a `READY` o achado com
**trigger reproduzível**; o resto fica `INBOX` para o próximo disparo.

### Camada B — Execução por card

Para cada card `READY`, o heartbeat invoca a **Workflow tool** com o harness JS
(`workflows/card-pipeline.mjs`) — **não** o `/nexus` interativo. O harness encapsula o
`gated()` + retry(2) + HALT do Nexus.

> **CONFIRM substituído (decisão declarada):** no modo autônomo, a fase `CONFIRM` humana do
> `/nexus` é trocada por (i) o **gate Crivo sobre o plano/spec** (`PLAN_APPROVED`) e (ii) a
> **porta humana do PR** no fim. O `/nexus` interativo segue disponível para trabalho manual.

### Camada C — Convergência verde

**Não** usamos `/goal` como motor (o avaliador Haiku só enxerga a conversa; em headless+Workflow
não há conversa para julgar). Em vez disso, o harness:

1. roda `npm test && npm run lint && tsc --noEmit`,
2. captura o exit code real e escreve em `cards/runs/<id>-<ts>.json`,
3. o `while` do harness repete o maker até o relatório em disco mostrar `exit=0` **ou** estourar
   N tentativas / o teto de custo.

O critério de "pronto" é um **artefato em disco verificável**, nunca a alegação do modelo.

**Auto-alimentação:** `verify_failed`/`HALTED` → o card volta a `INBOX` com a razão; deploy com
saúde ruim → card de rollback; PR mergeado → `/spec-archive` mescla o delta em `specs/` e arquiva.

---

## 3. A máquina de estados (= o seu pipeline)

> **PRINCÍPIO — Executar primeiro, polir depois.** A regra fixa do hicode: **primeiro executar a
> tarefa** (produzir um resultado funcional mínimo, **sem polir**) e **mostrar o preview** do
> resultado; só **depois** de você confirmar que é o resultado certo é que vêm **melhorar a
> arquitetura, testes/lint/ts, segurança, code-review e limpeza**. Validamos a **intenção** cedo —
> ninguém testa/refatora uma página que está errada.

O pipeline tem **duas fases**:

```
FASE 1 — EXECUTAR (resultado + preview):
  INBOX ─▶ [SPECCED ─▶ PLAN_APPROVED] ─▶ EXECUTED ─▶ PREVIEW ─▶ PREVIEW_OK
            └─ só mudança grande ─┘       (rápido,   (você VÊ    (você aprova
                                           sem polir)  o resultado) o resultado)

FASE 2 — POLIR (só depois do preview aprovado):
  ─▶ REFINED ─▶ TESTS_GREEN ─▶ SEC_CLEARED ─▶ REVIEWED ─▶ CLEANED ─▶ PR_OPEN ─▶ MERGED ─▶ DEPLOYED
     arquitetura  testes/lint/ts  segurança   code-review  limpeza   (PORTA HUMANA)

Exceção:  BLOCKED 2× / verify_failed / preview rejeitado ─▶ HALTED (humano destrava)
```

| # | Estado | Fase | Dono | Humano? | Gate para avançar |
|---|---|---|---|---|---|
| 0 | `INBOX` | — | heartbeat + triagem | — | trigger reproduzível → `READY` |
| 1 | `SPECCED` | exec | `/spec` (só card grande) | — | 1 Requisito ≥ 1 Cenário, tags `verify:` |
| 2 | `PLAN_APPROVED` | exec | **Crivo** (só card grande) | — | veredito sobre o plano; `BLOCKED` 2× → `HALTED` |
| 3 | **`EXECUTED`** | **EXECUTAR** | Limpio \| Vitro \| Radix (worktree) | — | **a tarefa funciona** (resultado mínimo, sem polir) |
| 4 | **`PREVIEW`** | **EXECUTAR** | harness (skill `run`) | — | app sobe + screenshot + URL de preview gerados |
| 5 | **`PREVIEW_OK`** | **EXECUTAR** | **humano** (auto se não-visual) | ✅ leve | **você vê o preview e aprova**; rejeição → volta a `EXECUTED` com motivo |
| 6 | `REFINED` | polir | Rufus / Limpio + Crivo | — | arquitetura melhorada **sem mudar comportamento** |
| 7 | `TESTS_GREEN` | polir | Testudo + harness | — | harness lê `exit=0` em `runs/<id>.json`; cobertura ≥ 90% das linhas tocadas |
| 8 | `SEC_CLEARED` | polir | Escudo (gated, só se aplicável) + Crivo | — | Crivo confirma fix **real**; `BLOCKED` 2× → `HALTED` |
| 9 | `REVIEWED` | polir | **Crivo** (review do diff) + Radix (verify SQL em staging efêmero) | — | diff cumpre cada Cenário; `verify:sql` PASS |
| 10 | `CLEANED` | polir | Pura + Pluto→Rufus | — | sem comentário de prosa / sem dead-code |
| 11 | `PR_OPEN`→`MERGED` | — | harness (`gh pr create`); **humano** | ✅ | **PORTA**: responde perguntas do Crivo + lê diff + merge; **CI re-roda os gates** |
| 12 | `DEPLOYED` | — | GitHub Actions + Radix (prod-replica) + Corvinus | — | health-check ok (prod atrás de Environment approval opcional) |
| ⚠ | `HALTED` | — | inbox de triagem | ✅ exc | Crivo `BLOCKED` 2× / verify recorrente / **preview rejeitado** N× |

> **Nota de fidelidade ao Rufus:** o refactor da `REFINED` não muda comportamento observável; se
> faltar rede de testes para refatorar com segurança, o Rufus escreve *characterization tests*
> primeiro (charter dele) — o suíte completo de `TESTS_GREEN` vem logo depois.

**Calibragem do Crivo (ajuste do crítico):** `risk: high` → Crivo em `opus` + verificação
profunda; `risk: low` → `sonnet` + revisão leve. Meta declarada de **taxa-de-passagem** por tipo
de card, monitorada no dashboard, para o "quase sem humano" não degenerar em "fila vermelha o dia
todo". O Crivo nunca vira rubber-stamp; o controle é o **risco**, não afrouxar o gate.

### 3.1 Preview — onde você vê o resultado

Logo após `EXECUTED`, **antes** de qualquer teste/lint/segurança/review, o harness **mostra o que
foi feito**. É a resposta direta a *"onde vejo, por exemplo, uma página nova?"*:

- **App rodando + URL viva** — o harness sobe o app a partir do **worktree do card** (o comando de
  run do projeto-alvo, declarado no `CLAUDE.md` dele) numa porta dedicada por card; a URL vai para o
  card e para o dashboard. Você abre e **interage com a página nova de verdade**.
- **Screenshot** — captura headless (ex.: Playwright) da(s) rota(s) afetada(s), salva em
  `cards/previews/<id>/` e embutida **inline no dashboard** (painel "Preview / Precisa de você") e no
  card. Assim você vê o resultado mesmo offline, sem abrir a URL.
- **Tarefa não-visual** (API / lógica / migration): o "preview" é a **saída funcional** —
  request→response do endpoint novo, stdout do script, ou o diff de schema — capturada como
  artefato. **Auto-aprovada** se o smoke check passar e não houver superfície visual.

**Aprovar / rejeitar** (simples, sem servidor): `hicode approve <id>` ou `hicode reject <id>
"motivo"` (um CLI fino que carimba o card), ou você simplesmente avisa o Claude. Aprovado → segue
para a fase de polir. Rejeitado → volta a `EXECUTED` com o motivo. Mais tarde, no PR, entra também a
**URL de preview-deploy** (staging) como segunda olhada antes do merge.

---

## 4. Modelo spec-driven (variante leve do OpenSpec)

**Decisão:** adotar **só o formato de spec delta** do OpenSpec — **não** o pacote npm
`@fission-ai/openspec` nem o GitHub Spec Kit. Motivo (consenso dos 3 juízes + pesquisa): trazer
qualquer um deles cria um **segundo orquestrador de slash-commands** (`/opsx`, `/speckit`) que
colide com o roteamento Nexus do `CLAUDE.md`, além de dependência Node ≥ 20.19, telemetria ligada
por padrão e um `AGENTS.md` concorrente disputando autoridade de instrução.

O que copiamos **verbatim** (barato, legível por humano e agente):

- `## ADDED / MODIFIED / REMOVED Requirements`
- `### Requisito: <nome>` com `MUST`/`SHALL`
- `#### Cenário: <nome>` com `GIVEN / WHEN / THEN / AND`
- regra **1 Requisito ⇒ ≥ 1 Cenário**; `MODIFIED` carrega o texto completo; `REMOVED` carrega
  `Reason` (+ `Migration`).

**Acerto-chave:** cada Cenário é classificado na origem por **verificabilidade**:

- `verify: sql` → estado checável no banco (vira query do Radix);
- `verify: test` → lógica (vira teste do Testudo);
- `verify: manual` → UI/percepção, não automatizável.

O estado 6 só marca "verified" nas dimensões realmente checadas — **nunca vende cobertura que o
SQL/teste não dá**. O ritual de spec só dispara para mudança **grande/cross-cutting/breaking**
(skill `/spec`); fix/typo nasce `READY` direto (Direct mode do Nexus). `specs/<domínio>.md` é a
fonte de verdade do comportamento atual; no merge, o `/spec-archive` mescla o delta lá
**transacionalmente** e move o card para `archive/`.

---

## 5. Verificação de banco (MCP read-only)

**Escolhido (D2): Supabase.** MCP oficial HTTP (`https://mcp.supabase.com/mcp`) com
`read_only=true` **e** `project_ref` (a flag read-only **não** cobre as ferramentas
administrativas — `project_ref` escopa para um único projeto e desativa criação de
projeto/branch), registrado em `.mcp.json` (scope project, versionável; token via
`${SUPABASE_ACCESS_TOKEN}`, **nunca em texto plano**). Recomenda-se apontar para um **projeto de
desenvolvimento**, não produção.

```jsonc
// .mcp.json
{
  "mcpServers": {
    "db-verificador": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=${SUPABASE_PROJECT_REF}&read_only=true",
      "headers": { "Authorization": "Bearer ${SUPABASE_ACCESS_TOKEN}" }
    }
  }
}
```

> *(Alternativa, se um dia migrar para Postgres direto: Postgres MCP Pro
> `--access-mode=restricted` + role `SELECT`-only.)*

**Defesa em profundidade — e a fronteira REAL declarada:**

1. `read_only=true` + `project_ref` no Supabase MCP força execução como usuário Postgres
   read-only e escopa a um único projeto — **best-effort** (a flag não cobre ferramentas admin;
   o `project_ref` é o que as desativa);
2. **FRONTEIRA REAL:** apontar para um **projeto Supabase de desenvolvimento** (não produção) e,
   para dados reais, um **role Postgres dedicado** `hicode_verificador` com **apenas `GRANT
   SELECT`** (sem INSERT/UPDATE/DELETE/DDL). Mesmo com falha da flag ou prompt-injection nos dados
   retornados, o banco recusa escrita. *(Prompt injection é o vetor citado pela própria Supabase.)*

> A denylist de `DROP TABLE` no `settings.json` **não** é creditada como defesa de banco (é
> string-matching contornável por `psql -f`/heredoc/ORM); é só guarda contra ops de shell óbvias.

**Quem usa:** **Radix**, derivando as queries dos Cenários `verify: sql` (ex.: *"THEN a coluna
`two_factor_enabled` existe default false"* → `SELECT` em `information_schema`).

**Paradoxo de ordenação da migration, resolvido:** a verificação **não** roda contra prod antes
do PR (a migration só é aplicada pelo deploy pós-merge). Um job de CI dedicado aplica a migration
num **banco staging efêmero** (descartável, separado do MCP read-only) e só então o MCP verifica
os invariantes ali. O `verify_sql` é revisado pelo Crivo como artefato separado (Radix não é juiz
do próprio verify). Pós-deploy, Radix re-roda contra prod-replica e Corvinus cruza com métricas.

> **Fallback (ajuste do crítico):** se o projeto-alvo não tiver réplica/staging, `verify: sql`
> **degrada para `verify: test`** (a verificação vira teste de integração contra um banco local
> de teste) — declarado, para não pressupor infra que não existe.

---

## 6. Dashboard HTML (bem simples, 100% self-contained)

**`cards/index.html`** single-file, **zero build/server**, dados embutidos inline. Aberto com
duplo-clique.

> **Ajuste do crítico (contradição resolvida):** **HTML + CSS inline puro, SEM CDN, SEM
> Chart.js.** A síntese crua dizia "CSP-safe/offline" **e** "Tailwind+Chart.js via CDN" — são
> incompatíveis. Para "bem simples" e de verdade offline, nada de `<script src>` externo. Métricas
> simples (contadores, barras) viram CSS/`<progress>`, não biblioteca de gráfico.

**Gerado por script determinístico** `render-dashboard.sh` (lê os cards, injeta os dados num
template HTML estático) — disparado pelo hook `Stop` e no boot de cada heartbeat. **Sem custo de
LLM por turno.** O Fulgor entra **uma única vez** no boot para criar o template bonito (e já sem
CDN); depois o script só injeta dados.

**Conteúdo:**

1. **KPIs no topo** — total, em-andamento, **AGUARDANDO-PR** (a fila humana, em amarelo),
   **HALTED** (vermelho), deployados hoje, **custo_usd** acumulado do último heartbeat.
2. **Kanban de uma tela** — colunas = os estados da máquina; cada card é um chip clicável
   (id + slug + agente + risk + idade + veredito Crivo verde/amarelo/vermelho).
3. **Painel "PREVIEW / PRECISA DE VOCÊ"** — cards em `PREVIEW` com o **screenshot embutido + link
   da URL viva** e o comando de aprovar/rejeitar (a porta de intenção, cedo); mais `PR_OPEN`, a
   inbox de triagem e `HALTED`.
4. **Últimas transições** — extraídas do Log de Estado.

É **espelho** do estado, nunca fonte. Publicável opcionalmente como Artifact ou GitHub Pages.

---

## 7. Modelo de segurança (fronteira real declarada)

Conveniência **não** é fronteira. As camadas, do mais fraco ao mais forte:

1. **`acceptEdits`** em todo headless, **nunca `bypassPermissions`**.
2. **`cwd-guard.sh`** — hook `PreToolUse` **obrigatório** com matchers **separados** para
   `Bash|Edit|Write|Read` (corrige o gotcha do matcher Bash-only): rejeita qualquer path/cwd fora
   do worktree do card ativo. **É isso** que torna o paralelismo seguro sob `acceptEdits` (que
   não faz sandbox de FS) — sem ele, "isolamento por worktree" é falso.
3. **FRONTEIRA REAL** (obrigatória **antes** do 24/7 desacompanhado — Fase 5): runner em
   **container** com FS escopado à workdir + usuário sem privilégio + **egress de rede restrito**.
   A denylist de string (`rm -rf`, `git push --force/origin main`, `npm publish`, `kubectl`,
   `terraform apply/destroy`, `DROP`) é **conveniência** contra erros óbvios, não fronteira robusta.
4. **Banco read-only** em duas camadas — fronteira real = role `GRANT SELECT`, não a flag (§5).
5. **Continuum gera artefatos, nunca aplica**; o PR/merge é a fronteira de deploy.
6. **Crivo** adversarial vinculante: maker nunca aprova o próprio trabalho; `BLOCKED` 2× = HALT.
7. **Subagentes herdam `acceptEdits` do pai** (gotcha confirmado): a denylist e o `cwd-guard` são
   **globais** no `settings.json` do pai, pois o filho não reduz permissão.
8. **`block-comments.mjs`** (Clean Code).
9. **TETO DE CUSTO como controle DURO** (o gate de quota de 90% é *fail-open* e cobre mal os
   subagentes via Workflow — **não** é o controle primário): o harness lê `total_cost_usd` do JSON
   de cada subagente (campo oficial), **soma por ciclo** de heartbeat e **aborta/enfileira** os
   cards restantes ao estourar um budget diário declarado, mostrando o número no dashboard antes de
   cada novo maker. `--max-budget-usd` só é usado **se confirmado existir** (ver decisão em [`03`](03-decisoes.md)).

### 7.1 Superfície HTTP do painel (Nuxt/Nitro) — fronteira declarada

O painel é uma ferramenta de **operador único, na própria máquina**. Não tem sessão, não tem
login — não é um produto multiusuário. A fronteira real, dada essa premissa, é de **rede**, não
de identidade:

1. **Bind em loopback por padrão.** `panel/package.json` roda `nuxt dev --port 4318` **sem
   `--host`** — o Nitro só escuta `127.0.0.1`. Isso fecha o vetor de "qualquer host na LAN chama
   a API sem autenticação". Se algum dia for preciso expor na LAN (testar de outro dispositivo),
   isso é uma decisão explícita e pontual do operador (`--host` na mão), não o padrão do repo.
2. **Guarda de origem para todo método mutante** (`server/middleware/00.origin-guard.ts`, lógica
   pura em `server/utils/origin-guard.ts`): POST/PUT/PATCH/DELETE são rejeitados com 403 se o
   header `Origin`/`Referer` estiver **presente e não bater** com o host da própria requisição —
   isso inclui origem **opaca** (`Origin: null`, de um iframe `sandbox` sem `allow-same-origin` ou
   de um documento `data:`) e qualquer valor que não seja uma URL válida: `hostDeOrigem()` lança em
   `new URL(...)`, e a ausência de host resultante é tratada como **bloqueio**, nunca como
   passagem. Isso fecha CSRF simples (POST disparado por uma aba de qualquer outro site que o
   operador tenha aberta, inclusive via iframe sandboxed com origem opaca) mesmo com o painel
   escutando em loopback. Só passa sem checagem a requisição em que o header está **totalmente
   ausente** (chamada direta via `curl`/scripts do próprio operador na máquina) — o modelo de
   ameaça aqui é o navegador de terceiros, não o próprio operador. Coberto por
   `test/origin-guard.test.ts` (origem própria, origem estrangeira, origem opaca `null`, origem
   malformada, ausência de header).
3. **Risco aceito, documentado:** não há autenticação (token/senha) nem CSRF token de
   double-submit. Para uma ferramenta local de operador único isso é proporcional; se o painel
   vier a ser acessado por mais de uma pessoa ou exposto fora de `localhost`, a fronteira acima
   deixa de valer e um mecanismo de auth real (token por sessão, no mínimo) passa a ser
   obrigatório antes disso — **não é para ser adicionado de forma incremental sem revisão**.
4. Endpoints que disparam subprocesso (`gh`, `claude`, `hii`, `git`, `npm run dev`) usam lista de
   argumentos (nunca `shell: true`/string interpolada) e todo `[id]` de rota passa por
   `parseCardId` antes de tocar o disco — ver `panel/server/utils/card-io.ts`.
5. **Dev server de preview também escuta só em loopback.** `startDev`/`startDevServer`
   (`server/api/project-preview.post.ts`, `server/api/cards/[id]/reset-preview.post.ts`) sobem o
   `npm run dev` do repo-alvo **sem `--host`** — mesma razão do item 1: sem isso, qualquer host na
   LAN alcançaria o dev server do projeto (Vite/Nuxt, sem auth, com `/@fs/` liberado) mesmo com o
   painel em si preso a loopback. Se o operador precisar acessar o preview de outro dispositivo, é
   decisão manual dele, fora do padrão do repo — igual ao item 1.
6. **`GET /api/preview/[id]` é somente leitura.** Capturar screenshot (`npx playwright
   screenshot`, até 60s, síncrono via `spawnSync`) é uma ação **mutante e cara** — por isso vive em
   `POST /api/cards/[id]/preview-shot`, coberto pela guarda de origem do item 2. O `GET` só serve o
   PNG já em disco (404 se não existir). Isso fecha o vetor de `<img src="/api/preview/1?fresh=1">`
   embutido numa página de terceiro: antes, um `GET` cross-origin (que navegadores não gateiam por
   `Origin`, mesmo com a guarda do item 2 cobrindo métodos mutantes) conseguia forçar recaptura
   repetida e travar o processo do painel por até 60s por chamada.

---

## 8. Layout de diretórios

```
hicode/                       # painel + estado
├── README.md                  # como rodar o painel, referência
├── CLAUDE.md                  # roteamento Nexus + regras do repo (autoridade de instrução)
├── .mcp.json                  # db-verificador: Supabase MCP HTTP read_only=true + project_ref; + github MCP
├── panel/                     # Vue 3 + Nuxt 4 — interface visual
│   ├── server/
│   │   ├── motor/             # MotorClient: fala com hii (dispatch, eventos, estado)
│   │   ├── card/              # leitura de cards e specs (local, sem motor)
│   │   ├── ia/                # preferências de IA (local, sem motor)
│   │   ├── api/               # rotas Nuxt: card-io, ia.get/post, motor.get, historico
│   │   └── utils/
│   ├── components/            # Vue components
│   └── pages/                 # páginas Nuxt
├── .claude/
│   ├── settings.json          # permissions.deny + defaultMode acceptEdits + hooks
│   ├── agents/                # os 15 agentes Nexus (crivo.md ESTENDIDO p/ spec+diff)
│   ├── skills/
│   │   ├── nexus/             # orquestrador do kit (modo manual)
│   │   ├── hicode-triage/     # heartbeat: descobre trabalho, escreve cards, regenera dashboard
│   │   ├── spec/              # OPCIONAL: gera Requisitos+Cenários(delta) p/ mudança grande
│   │   └── spec-archive/      # mescla delta em specs/ TRANSACIONAL + arquiva
│   ├── hooks/
│   │   ├── block-comments.mjs # Clean Code (do kit)
│   │   └── block-monolithic.mjs # teto de 350 linhas (do kit)
│   └── worktrees/             # MOTOR - vive no hii, nao aqui
├── config/                    # ESTADO COMPARTILHADO COM MOTOR
│   ├── repos.json             # repositórios-alvo (path local, remote, base, politicas)
│   ├── ia.json                # preferências de IA (provider, modelos, esforço por papel)
│   └── pipeline.json          # MOTOR - configuração de steps (consulta/altera via MotorClient)
├── cards/                     # ESTADO COMPARTILHADO COM MOTOR — A ESPINHA
│   ├── 001-add-2fa.md         # card (fonte de verdade)
│   ├── archive/               # AAAA-MM-DD-<slug>.md
│   ├── runs/<id>-<ts>.json    # MOTOR - exit codes/tokens/tempo por execução
│   └── previews/<id>/         # MOTOR - screenshot + URL do preview
├── specs/                     # FONTE DE VERDADE por domínio (estado atual)
├── docs/adr/                  # ADRs (o porquê)
├── OrquestracaoGovernanca.md  # modelo de governança
├── METODOLOGIA.md             # Loop Engineering
└── plano/                     # documento de arquitetura (este arquivo)

hii/                          # motor (repo irmão) — execução, pipeline, gates, worktrees
├── lib/                       # runner, ai, contract, card, core
├── bin/hii.ts                 # CLI do motor
├── runner.ts                  # entrypoint
└── ... (ver hii/README.md)
```

**Motor vs Painel: divisão de responsabilidades**

| Componente | Responsável | Detalhes |
|---|---|---|
| `cards/` | Ambos | painel escreve, motor lê e executa |
| `cards/runs/` | Motor | painel só lê |
| `config/repos.json` | Ambos | painel consulta, motor executa |
| `config/ia.json` | Painel | motor lê |
| `config/pipeline.json` | Motor | painel consulta/altera via MotorClient |
| Worktrees, git, PR | Motor | não existe no hicode |
| MotorClient | Painel | interface para falar com hii |

> **Separação concluída** (agosto/2026): motor removido do hicode, vive em `/home/rpolan/projects/podium/hii`.
> Todas as 143 linhas de `lib/`, `bin/`, `runner.ts` foram para lá. Hicode agora é **só painel + estado**.

Próximo: [`03-decisoes.md`](03-decisoes.md).
