# hii · hicode · hidash — design

**Data:** 2026-08-18
**Estado:** aprovado o caminho (estrangulamento, roteador primeiro); aguardando revisão desta spec.

## 1. Problema

O `hicode` hoje é um repositório único de ~12.300 linhas de TypeScript que acumula três
responsabilidades incompatíveis em ritmo e em público:

| módulo | linhas | natureza real |
|---|---|---|
| `lib/ai` | 1.006 | provedor, custo, catálogo, health, quota |
| `lib/runner` | 4.191 | pipeline, worktree, gates, git, preview |
| `lib/contract` + `lib/card` | 553 | contrato de repo, formato de card |
| `lib/core` | 5.665 | dispatch, sessão, render, TUI, board |
| `bin` | 888 | `repl.ts` (668) + `hii.ts` |
| `panel` | 3.850 | Nuxt |

O maior módulo (`lib/core`) é interface de terminal para cadastrar e acompanhar tarefa — e é
justamente o que se mostrou o caminho errado de entrada. A consequência mediável: numa única
sessão de trabalho, seis defeitos de superfície (quadro estourando o terminal, painel de
confirmação invisível, plano de 19 linhas escondido, texto da IA cortado, resultado de
ferramenta na chamada errada, repintura desnecessária) consumiram mais tempo que qualquer
melhoria de motor.

Ao mesmo tempo, o que tem valor fora deste repositório — roteamento entre modelos, execução
com gates, contabilidade de custo — está preso a ele.

## 2. Os três projetos

A fronteira não é `card` versus `job`. É **autoridade**.

| | **hii** — motor | **hicode** — painel | **hidash** — observação |
|---|---|---|---|
| autoridade | executar | autorar e governar | ler |
| stack | TypeScript + Bun, CLI + HTTP | Vue 3 + Nuxt + Bun | Nuxt 3 |
| vocabulário | `job`, `target` | `card`, `spec`, `contrato` | evento, métrica |
| repositório | próprio | próprio | próprio |

### 2.1 hii possui

- **Targets** com regras salvas: qual repositório, política de branch, comandos de build/teste,
  política de modelo, passos permitidos, configuração de gate.
- **Roteamento BYOK**: escolha de provedor e modelo por classe de tarefa e por *hardness*, com
  cadeia de fallback, contabilidade de custo e sondagem de saúde.
- **Grafo de execução**: DAG de passos, substituindo a lista linear de fases.
- **Agent loop**: laço de ferramentas próprio, com orçamento e auto-reparo.
- **Hardness**: dificuldade estimada do job, que governa tier de modelo e profundidade de revisão.
- **Gauntlet Loop**: júri de críticos independentes com refinamento automático.
- **Worktree e git**: criação a partir de `main` atualizado, commit, push, abertura de PR.

### 2.2 hii NÃO possui

- **Preview / dev server.** O motor não sobe aplicação, não aloca porta, não tira screenshot.
  Quem quer ver rodando é o desenvolvedor, na mão, ou o painel, localmente. Isto remove
  `lib/runner/preview.ts`, `lib/core/previews.ts`, `lib/core/preview-estado.ts` (226 linhas) e o
  estado `PREVIEW` do ciclo de vida.
- **Conhecimento de card, spec ou Log de Estado.** hii recebe job neutro. Quem traduz é o hicode.
- **Merge.** hii abre o PR e para. Nem hii nem agente algum executa `gh pr merge`. O clique é humano.

### 2.3 hicode possui

Cadastro de tarefa em Vue 3; specs; contratos; padrão de utilização; leitura de intenção
(pedido versus pergunta); histórico e custo por card; interface de aprovação; preview local
opcional, por ação explícita do humano. Traduz `card` em `job` e persiste o resultado.

### 2.4 hidash possui

Painéis configuráveis sobre os eventos e métricas que o hii expõe: hardness por job, rodadas de
gauntlet, achados por crítico, custo por modelo e por target, taxa de reprovação. Somente leitura.
Fase posterior; nada nesta spec depende dele existir.

## 3. O contrato — o plug

`hii` publica **`@podium/hii-client`**: cliente tipado mais os JSON Schemas de `Target`, `Job`,
`JobEvent`, `Policy` e `Finding`. Este pacote é a única superfície pública. hicode e hidash
dependem de um range semver; nenhum dos dois importa caminho interno do hii.

Versionamento: mudança compatível sobe *minor*; mudança de forma de `Job` ou `JobEvent` sobe
*major*. Os schemas são gerados a partir dos tipos, e o CI do hii falha se um schema mudar sem
bump — o contrato não pode deslizar em silêncio.

## 4. hii — arquitetura interna

### 4.1 Target

Um target é um destino de execução com regras salvas. Substitui o que hoje está espalhado entre
`.hii/`, `repos.json` e `lib/contract`.

```jsonc
{
  "nome": "cashbarber2",
  "repo": "/caminho/local/do/repo",     // fica local; nunca vai para o git do hii
  "remote": "owner/nome",
  "base": "main",
  "branch": "hii/{id}-{slug}",
  "comandos": {
    "build": "bun run build",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "lint": "bun run lint:types"
  },
  "politicaDeModelo": "padrao",
  "passos": ["arquitetura", "testes", "seguranca", "review", "limpeza"],
  "gates": { "build": true, "test": true, "typecheck": true, "lint": true },
  "pilha": { "ligada": false, "tetoDeArquivos": 30 }
}
```

O caminho do repositório-alvo permanece **local e configurado**, nunca versionado.

### 4.2 Roteador BYOK

Famílias de transporte: `anthropic`, `openai-compativel` (cobre OpenRouter, DeepSeek, Qwen,
Groq, Together e qualquer endpoint compatível), `google`, `ollama-local`. Chaves vêm do ambiente
do operador — BYOK, sem intermediação.

Catálogo de modelos com preço de entrada, saída e cache. Política mapeia
`(classe de tarefa × hardness) → tier`, e tier resolve para uma lista ordenada de modelos:

```jsonc
{
  "nome": "padrao",
  "tiers": {
    "barato":   ["deepseek-v4-flash", "qwen-3.7"],
    "medio":    ["deepseek-v4", "sonnet"],
    "caro":     ["opus"]
  },
  "classes": {
    "classificar":  "barato",
    "gerar":        "barato",
    "refatorar":    "medio",
    "revisar":      "caro",
    "adjudicar":    "caro"
  }
}
```

Fallback: falha de transporte ou 5xx desce na lista do mesmo tier. **Quota esgotada não troca de
provedor** — o job entra em espera e o humano decide. Este comportamento é decisão do operador e
fica travado por teste.

### 4.3 Hardness

Pontuação de 0 a 5 calculada de sinais determinísticos, sem custo de modelo, no momento do
plano: risco declarado no job; sinal de segurança, de dados e de dependência no texto do
objetivo; ausência de sinal claro (ambiguidade, que **aumenta** o hardness em vez de reduzir);
menção a mais de um subsistema (cross-cutting); e ação externa (que **zera** os passos de
código). Contagem de arquivos não entra aqui: ela só existe depois do diff, e hardness precisa
ser conhecido antes de gastar. Governa três coisas:

| hardness | tier de geração | críticos no gauntlet | spec exigida |
|---|---|---|---|
| 0–1 | barato | 1 | não |
| 2–3 | medio | 2 | não |
| 4–5 | caro para revisar, medio para gerar | 3 | sim |

Hardness é calculado antes de gastar, e aparece no evento inicial do job.

### 4.4 Grafo de execução

Passos formam um DAG. Cada passo declara `needs`, tipo de gate e condição. Isso substitui a lista
linear de fases e habilita fan-out (críticos em paralelo) com junção.

Passos determinísticos (build, teste, typecheck, lint) não consomem modelo e rodam primeiro
sempre que houver o que verificar — seu resultado é a evidência que alimenta o gauntlet.

### 4.5 Agent loop

Laço de ferramentas próprio sobre HTTP BYOK: `read`, `write`, `edit`, `glob`, `grep`, `bash`.
Padrões concretos, configuráveis por target: teto de **80 iterações** por passo, orçamento de
**US$ 2,00** por job e **US$ 0,50** por passo, e **3 tentativas** de auto-reparo por erro de
ferramenta antes de o passo falhar. Estourar orçamento **para o job** e registra o motivo; nunca
degrada silenciosamente para um modelo mais barato, porque isso esconde do operador que o teto
foi atingido.

O **diretório de trabalho é confinado ao worktree do job por construção** — a ferramenta resolve
todo caminho contra a raiz do worktree e rejeita o que escapar. Não é hook opcional.

Isto corrige um defeito estrutural do motor atual: hoje toda invocação usa `cwd` na raiz do
plano de controle, e o guard prometido na documentação não existe como arquivo. Consequência
observada: um job de um repositório-alvo passou a execução inteira lendo e tentando editar o
próprio plano de controle.

**Ponte temporária.** Enquanto o laço próprio não alcança paridade, a mesma API `/v1/jobs`
delega ao CLI do Claude. A ponte é explícita: um evento do job declara qual motor executou, e o
`cwd` do subprocesso é o worktree, com os agentes injetados por `--agents`. A ponte é aposentada
quando a paridade for medida, não quando parecer pronta.

### 4.6 Gauntlet Loop

Júri de críticos independentes com refinamento automático, ativado por flag. Cinco regras
governam o laço:

**1. Todo giro adiciona sinal externo.** Refinamento iterativo sem sinal de fora estagna. Cada
rodada começa pelos verificadores determinísticos; seus resultados são a evidência dos críticos.
Rodada que não produz sinal externo novo não conta como rodada.

**2. Contexto limpo e lente distinta por crítico.** Três papéis no mesmo contexto são três
máscaras, não três juízes. Cada crítico recebe contexto próprio, uma lente própria (fidelidade ao
objetivo, conformidade ao contrato do projeto, correção técnica, reprodutibilidade) e, quando o
catálogo permitir, **modelo diferente**. Diversidade de modelo vale mais que diversidade de prompt.

**3. Convergência garantida.** Três freios, todos com valor padrão concreto e configurável por
target: teto de **6 rodadas**; exigência de achados abertos **estritamente decrescentes** entre
rodadas (rodada que não reduz o conjunto aberto encerra o laço); e parada por **2 rodadas
consecutivas sem achado novo**. A parada é por seca, não por unanimidade. Sem isto o laço oscila
— a correção de um crítico quebra o critério de outro — ou deriva para aprovação depois de
algumas rodadas.

Ao encerrar por teto ou por não-decrescimento, o job **não é declarado aprovado**: ele para com
os achados abertos registrados, para decisão humana. Encerrar o laço e aprovar são coisas
diferentes.

**4. Agregação por natureza do achado.** Achado **reprodutível** — teste que falha, build que
quebra, typecheck vermelho — é decisivo sozinho, independente de voto. Achado de opinião precisa
de maioria. Maioria simples sozinha deixaria dois críticos fracos derrubarem um certo.

**5. O gerador nunca vê a rubrica.** Recebe achados, não critérios. Ver a régua ensina a
satisfazer a régua em vez do objetivo.

**A catraca.** Achado que reaparece em três jobs do mesmo target é promovido a checagem
determinística — regra de lint ou teste — e registrado no target. O sistema fica mais barato e
mais forte com o uso, em vez de pagar o mesmo júri para sempre.

### 4.7 Flags de job

| flag | padrão | efeito |
|---|---|---|
| `impressione` | **desligada** | liga o Gauntlet Loop completo. Desligada: uma passada mais os gates determinísticos. |
| `layoutFirst` | **desligada** | insere uma passada de layout e estrutura antes da lógica, para trabalho visual. Herda o contrato da flag `layout` atual, que já nasce desligada e é apenas *sugerida* quando o objetivo traz palavra visual subjetiva. |
| `steps` | `auto` | `all` força todos os passos; lista força apenas aqueles. |
| `risk` | `low` | `high` força profundidade máxima, vencendo o cálculo de hardness. |

Ambas as flags novas são explícitas e por job. Nenhuma liga por heurística.

### 4.8 Ação externa

Job cuja instrução é agir em ferramenta externa (criar tarefa no Notion, mensagem no Slack) não
abre passo de código e não tem gate de build. Antes de executar, o motor **verifica o conector de
verdade e de graça**: um servidor MCP só conta como usável se estiver conectado *e* tiver escopo
persistente. Servidor que pede autenticação, ou que existe apenas na sessão interativa, para o
job com o motivo escrito e custo zero.

Limite medido, que a spec assume: conector MCP com OAuth **não funciona em processo headless** —
a autorização está presa à sessão interativa e não atravessa. Ação externa em ferramenta desse
tipo exige token direto por variável de ambiente e chamada HTTP, não MCP.

### 4.9 Custo, quota e saúde

Custo por chamada lido do provedor quando disponível, estimado pelo catálogo quando não, sempre
marcado como medido ou estimado. Acúmulo por job, por target e por janela. Quota por provedor com
janela de 4 horas. Sondagem de saúde antes de escolher, com resultado memoizado.

## 5. API

### 5.1 Camada roteador — o plug universal

`POST /v1/chat/completions`, compatível com OpenAI, com streaming. Qualquer ferramenta ou
linguagem que já fale OpenAI aponta a base URL para o hii e ganha roteamento BYOK, fallback e
contabilidade de custo sem uma linha de código nova.

`GET /v1/models` lista o catálogo com preço e disponibilidade.

### 5.2 Camada job — nativa

| rota | efeito |
|---|---|
| `POST /v1/jobs` | cria job: `{target, objetivo, flags, policy?, steps?}` → id |
| `GET /v1/jobs/:id` | estado, hardness, custo, passos |
| `GET /v1/jobs/:id/events` | SSE ao vivo: passo, ferramenta, achado, veredito, custo |
| `POST /v1/jobs/:id/answer` | responde pergunta que travou o job |
| `POST /v1/jobs/:id/approve` | aprova o plano e enfileira |
| `POST /v1/jobs/:id/halt` | para com motivo |
| `GET /v1/targets` · `GET /v1/cost` | configuração e gasto |

### 5.3 CLI

`hii run`, `hii jobs`, `hii models`, `hii cost`, `hii targets`, `hii serve`. Saída em texto e
`--json` em todos. Sem interface interativa: o CLI é para script e para inspeção, não para
cadastrar tarefa.

### 5.4 Consumo multilinguagem

O endpoint compatível dá suporte imediato, sem trabalho nosso, a Python, Go, Rust, Java, C#, PHP
e Ruby, pelos SDKs OpenAI que cada linguagem já tem. Clientes tipados de primeira classe apenas
onde agregam: **TypeScript** (mesma stack do hicode, tipos compartilhados) e **Python** (onde vive
o ecossistema de IA). A camada `/v1/jobs` não tem padrão de mercado e precisa de cliente próprio:
TypeScript primeiro, Python em seguida.

## 6. Linguagem do motor — decisão medida

O motor permanece em TypeScript sobre Bun. A pergunta sobre Go ou Rust foi resolvida por medição,
não por preferência. Somando os tempos reais de 9 execuções em disco:

```
Executando        953s  46,0%   espera de modelo
Limpeza           456s  22,0%   espera de modelo
Reajuste          412s  19,9%   espera de modelo
Preview           181s   8,7%   subprocesso
Revalidacao        45s   2,2%   espera de modelo
Testes             25s   1,2%   subprocesso
fora dos passos   107s   4,9%   git, IO, spawn e orquestração
```

**95% do tempo é espera.** A CPU do orquestrador é uma fração dos 4,9% restantes, e a maior parte
desses 107 segundos é git e criação de processo. Reescrever compraria, no teto teórico, menos de
5%; na prática, 1 a 2%.

Onde outra linguagem ganharia de fato: binário estático único, que `bun build --compile` já
entrega; e milhares de streams concorrentes, que não é a escala deste sistema. Se um dia for, o
movimento é um proxy na frente do motor, não a reescrita do motor.

## 7. Migração — estrangulamento

Cada fase deixa o sistema funcionando.

**F0 — preparar (repositório atual).** Remover preview do motor. Corrigir o confinamento de
`cwd`. Sem mudança de repositório ainda.

**F1 — extrair o hii com o roteador.** Repositório novo com `lib/ai` como base, transporte HTTP
BYOK, `/v1/chat/completions`, `/v1/models`, CLI e `@podium/hii-client` v0.1. O hicode continua
como está, consumindo o pacote. **Entrega valor sozinho**: um roteador BYOK apontável por
qualquer ferramenta, independente do hicode existir.

**F2 — mover a execução.** `lib/runner` atravessa para o hii atrás de `/v1/jobs`, invertendo a
dependência sobre `card-store`: o motor passa a falar `job` e `target`. A execução agêntica é
atendida pela ponte ao CLI do Claude. O hicode traduz `card` em `job` e persiste o card.

**F3 — o motor próprio.** Laço de ferramentas em HTTP BYOK, grafo de execução, hardness, Gauntlet
Loop com as cinco regras. Ponte aposentada quando a paridade for medida.

**F4 — hidash.** Nuxt 3 lendo eventos e métricas do hii.

## 8. O que morre

- Preview no motor: 226 linhas de módulos dedicados e o estado `PREVIEW`.
- `lib/core/render` (~1.900 linhas): a web renderiza em Vue.
- Lógica de cadastro de tarefa no terminal: o TUI sobrevive como **cliente fino** do
  `hii-client`, sem lógica própria.

## 9. Não-objetivos

Multi-tenant e hospedagem. Autenticação de usuários no hii — ele roda na máquina do operador.
Merge automático, em qualquer circunstância. Preview no motor. Reescrita de linguagem.

## 10. Riscos

| risco | mitigação |
|---|---|
| Ponte ao CLI vira permanente e o laço próprio nunca chega | paridade medida por suíte de jobs de referência; evento declara qual motor rodou, e a proporção é visível no hidash |
| Custo multiplica no gauntlet (rodadas × críticos × modelo) | hardness limita críticos (1 a 3) e tier; determinísticos rodam primeiro e de graça; teto de 6 rodadas e de US$ 2,00 por job, com parada dura ao estourar |
| Contrato desliza entre três repositórios | schemas gerados dos tipos; CI do hii falha sem bump; hicode fixa range semver |
| Ação externa por MCP falha headless | verificada antes de gastar; ferramenta com OAuth exige token direto |
| Inversão da dependência de card quebra a suíte | F2 é a fase mais pesada; migra com a suíte atual como rede, teste por teste |

## 11. Como se verifica

Cada fase entra com gate verde: testes, typecheck da raiz e do painel, lint de tipos.

Específico por subsistema: schemas do contrato com round-trip; política de roteamento com
fixtures de catálogo e de falha; convergência do gauntlet com críticos sintéticos, provando que o
laço para em K rodadas sem achado novo e que achado reprodutível decide sozinho; hardness com
tabela de casos reais em português; confinamento de `cwd` provado por tentativa de escrita fora
do worktree.
