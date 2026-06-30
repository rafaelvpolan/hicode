# 03 — Escrevendo os melhores prompts em cada nível do Opus 4.8

Este é o documento central do kit. A ideia-chave:

> **Existe um "nível de máquina" certo para cada tamanho de tarefa.** Pedir pouca máquina
> para um problema grande entrega trabalho raso; pedir muita máquina para um problema
> pequeno queima tempo e tokens. O melhor prompt é o que **ativa o nível certo** e dá ao
> modelo exatamente o que ele precisa para acertar de primeira.

Há dois eixos independentes que você controla com o prompt:

1. **Nível de máquina** — quanta orquestração você engata (N0 a N4).
2. **Controles do modelo** — reasoning effort, janela de 1M, fast mode.

---

## Parte A — Os 5 níveis de máquina

| Nível | O que é | Quando usar | Como ativar |
|------|---------|-------------|-------------|
| **N0** | Prompt direto no loop principal | Trivial, exploração, dúvida conceitual, 1 arquivo conhecido | Só perguntar |
| **N1** | Um agente especializado | Trabalho de domínio único e fechado | "Use o **\<agente\>** para..." ou deixe o roteamento decidir |
| **N2** | Multi-agente manual + Crivo | 2–3 agentes com ordem clara que você mesmo conduz | "Rode X, depois Y, passe pelo crivo" |
| **N3** | `/nexus` | Pipeline de verdade: várias preocupações, gates, paralelismo | `/nexus <tarefa>` |
| **N4** | Workflow tool | Fan-out determinístico, loops, verificação adversarial em escala | "use a workflow" / via `/nexus` |

### N0 — Prompt direto
O Claude resolve no loop principal, sem subagente. Ideal para: "o que esse arquivo faz?",
"renomeia essa variável", "explica essa stack trace", "lê o `config.ts` e me diz X". Não há
overhead. Antipadrão: usar N0 para implementar uma feature inteira — vira um prompt gigante
sem revisão.

### N1 — Um agente especializado
Você delega **uma** preocupação a **um** agente. É o cavalo de batalha do dia a dia. Com o
bloco de `CLAUDE.md` instalado, muitas vezes você nem nomeia o agente — o Claude roteia. Mas
nomear é mais previsível: *"use o limpio para implementar X"*, *"use o escudo para auditar
o login"*. Resultado de agente **gated** deve fechar com o Crivo (ver N2).

### N2 — Multi-agente manual
Você encadeia poucos agentes e conduz a ordem. Útil quando você sabe exatamente o caminho e
ele é curto: *"use o radix para criar a migration, depois o crivo para revisar (risco
alto)"*. Acima de 2–3 passos, ou quando há paralelismo/gates de verdade, suba para N3 — é
menos trabalho manual e mais determinístico.

### N3 — `/nexus`
O orquestrador. Ele **ANALISA** a tarefa (lê git diff, arquivos), **PLANEJA** o pipeline
(seleciona agentes, define ordem, insere gates Crivo após cada gated, marca o que roda em
paralelo), **CONFIRMA com você** (sempre — mostra a tabela do pipeline), **EXECUTA** e
**REPORTA**. Use quando a tarefa toca várias preocupações (código + testes + segurança +
docs) ou exige gates e paralelismo. Você aprova o plano antes de rodar.

### N4 — Workflow tool
A artilharia pesada: fan-out de muitos subagentes de forma determinística, com loops,
verificação adversarial e síntese. O `/nexus` cai aqui sozinho para qualquer pipeline com
≥2 agentes ou qualquer agente gated. Você só pede N4 diretamente para trabalho de **escala**:
auditar um repositório inteiro, migração ampla, "encontre todos os X e verifique cada um".
Custa muitos tokens — peça explicitamente ("use a workflow", "seja exaustivo").

### Tabela de decisão rápida

| Tamanho da tarefa | Nível | Pipeline típico |
|---|---|---|
| typo / 1 linha / rename | N0 ou N1 direto | 1 agente, sem gate |
| bug isolado | N1 + gate | 1 agente + 1 Crivo (muitas vezes risco baixo) |
| feature | N3 | Limpio + Testudo (+ Escudo se toca auth/dados) + gates |
| mudança ampla / auditoria | N3→N4 | pipeline largo, verificação adversarial |
| varrer o repo inteiro | N4 | fan-out + completeness critic |

---

## Parte B — Controles do modelo Opus 4.8

Os níveis acima decidem **quantos agentes**. Estes controles decidem **quão fundo** o modelo
pensa e **quanto** ele enxerga.

### Reasoning effort (low / medium / high / xhigh / max)
É o "quanto raciocinar antes de agir". Suba quando o problema é difícil de raciocínio
(concorrência, design de algoritmo, prova de correção, revisão adversarial profunda); desça
para trabalho mecânico (renomear, formatar, aplicar patch óbvio). No Workflow/Nexus dá para
pedir effort por estágio: estágios baratos em `low`, o gate adversarial em `high`/`max`.
Regra prática: **comece em medium; suba para high/xhigh quando errar por falta de raciocínio,
não por falta de contexto.** Falta de contexto se resolve dando mais informação, não mais
effort.

### Janela de 1M de tokens
O Opus 4.8 aqui tem **1 milhão de tokens** de contexto. Na prática:
- Cabe um repositório médio inteiro, logs longos, specs grandes. Use isso — colar o código
  relevante no prompt costuma valer mais que mandar o modelo procurar.
- Mas contexto não é de graça: encher a janela de ruído piora a atenção ao que importa.
  Prefira **o trecho certo** a "tudo". Os agentes read-only (Explore, Quaero, Pluto) existem
  justamente para destilar muito material em pouca conclusão sem inundar o contexto principal.
- Em conversas longas o harness resume o contexto automaticamente — você não precisa "fechar"
  a tarefa cedo por medo de estourar.

### Fast mode (`/fast`)
Liga saída mais rápida do Opus (não troca por um modelo menor — continua Opus). Bom para
iteração interativa e tarefas onde latência incomoda. Para o raciocínio mais pesado
(auditoria de segurança, design difícil), prefira o modo normal com effort alto.

### Combinações que valem a pena
- **Exploração ampla, resposta curta:** N1 com um agente read-only (ou o `Explore`) +
  effort medium. Ele varre, você recebe só a conclusão.
- **Design difícil:** N0/N1 + effort high/xhigh + bastante contexto colado.
- **Pipeline com gate sério:** N3, marcando o passo como risco alto → Crivo em `opus` fundo.
- **Varredura exaustiva:** N4 + "seja exaustivo" + effort alto só no estágio de verificação.

---

## Parte C — Anatomia de um bom prompt

Vale em todos os níveis. Um prompt forte tem (quase) sempre estes seis elementos. Não precisa
de seções formais — uma frase por item já muda o resultado.

1. **Objetivo** — o resultado desejado, não a tarefa mecânica. ❌ "mexe no `auth.ts`" →
   ✅ "garante que tokens expirados sejam rejeitados em toda rota protegida".
2. **Contexto** — onde fica, qual stack, o que já existe, o trecho relevante colado. Mais
   contexto bom > mais effort.
3. **Restrições** — o que respeitar: não mudar contrato público, manter a lib X, seguir o
   padrão do arquivo Y.
4. **Critério de pronto** — como saber que terminou: "todos os testes passam", "cobertura de
   branch ≥ 90% no domínio", "p95 < 200ms". Sem isso, o modelo inventa o critério dele.
5. **Formato de saída** — o que você quer de volta: só o diff, um relatório, a lista de
   achados, um plano antes de tocar.
6. **Escopo / o que NÃO fazer** — a fronteira. "Só o módulo de pagamento; se vir problema
   fora dele, sinaliza e para." Isso evita o agente sair refatorando o mundo.

### Antipadrões (e o conserto)

| Antipadrão | Por que falha | Conserto |
|---|---|---|
| "Melhora esse código" | Sem objetivo nem critério; o modelo adivinha | Diga *qual* dimensão (legibilidade? perf? bug?) e o aceite |
| "Faz tudo: feature + testes + deploy + docs" num prompt só | Vira N0 fazendo trabalho de N3 sem gate | Suba para `/nexus` e deixe ele montar o pipeline |
| Pedir e não dar contexto | Modelo procura, erra o alvo, ou inventa | Cole o trecho / aponte o arquivo / diga a stack |
| "Refatora o projeto inteiro" sem escopo | Diff gigante, risco alto, revisão impossível | Delimite módulo + "um conceito por vez" (é o jeito do Rufus) |
| Subir effort para resolver falta de informação | Effort não substitui contexto | Dê informação; só suba effort para dureza de raciocínio |
| Aceitar resultado de agente gated sem Crivo | Perde a rede de revisão adversarial | Sempre feche gated com o crivo (N2/N3 já fazem isso) |

---

## Parte D — Como o CLAUDE.md molda o default

Sem o bloco de roteamento, o Claude resolve quase tudo em N0 (ele mesmo). Com o bloco:

- Frases de domínio claras ("revise a segurança de…", "essa query está lenta…") fazem o
  Claude **subir para N1 automaticamente** e chamar o agente certo.
- A regra "delegue trabalho de domínio substancial" é literalmente o gatilho que muda esse
  default. A regra do Crivo é o que garante revisão. A regra "para pipeline, prefira `/nexus`"
  é o que empurra de N2 manual para N3 orquestrado.

Ou seja: **você escreve o prompt, mas o `CLAUDE.md` escreve o comportamento padrão.** Manter
o `CLAUDE.md` do projeto bom (stack, comandos, convenções, fronteiras) é o multiplicador que
faz prompts curtos renderem como prompts longos.

---

## Exemplos lado a lado

**Tarefa: corrigir um bug de cálculo de desconto.**
- ❌ Fraco (N0): *"o desconto tá errado, arruma"*.
- ✅ Forte (N1+gate): *"use o limpio: o cálculo de desconto em `pricing/discount.ts`
  aplica o cupom antes do imposto, deveria ser depois (ver regra em `RULES.md`). Conserte
  só essa função, adicione um teste que prove a ordem correta, não mude a assinatura
  pública. Depois passe pelo crivo (risco baixo)."*

**Tarefa: nova feature de exportação de relatório.**
- ❌ Fraco (N0): *"cria a exportação de relatório com testes e doc e deixa seguro"* (um prompt
  só, sem gate, fazendo trabalho de pipeline).
- ✅ Forte (N3): *"/nexus implementar exportação de relatório em CSV no módulo `reports`:
  endpoint novo + service. Precisa de testes (Testudo, ≥90% no domínio) e revisão de
  segurança porque expõe dados de cliente (Escudo, risco alto). Documente o endpoint
  (Glossia). Não toque no schema existente."*

**Tarefa: entender por que a listagem está lenta.**
- ❌ Fraco: *"otimiza a listagem"* (sem baseline, sem alvo).
- ✅ Forte (N1, Celer/Radix): *"use o celer: a rota `GET /orders` está em ~1.2s no p95 em
  produção. Faça profiling, ache o gargalo dominante e proponha a menor mudança que derrube
  isso para <300ms, medindo antes/depois. Se for problema de índice/plano de query, passe
  para o radix em vez de otimizar no código."*

---

Próximo: [`04-default-vs-nexus.md`](04-default-vs-nexus.md) — a diferença entre o modo default
e o `/nexus`.
