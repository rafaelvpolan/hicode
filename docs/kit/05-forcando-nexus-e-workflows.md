# 05 — Forçando o `/nexus` e o melhor workflow

Os agentes e o `/nexus` só rendem se você os ativar e dimensionar certo. Este doc é sobre
**fraseado**: que palavras no seu prompt empurram o Claude (no default) ou o `/nexus` a
engatar o melhor workflow — e a não sub/superdimensionar. (Se a diferença entre default e
`/nexus` ainda não está clara, leia o [doc 04](04-default-vs-nexus.md) antes.)

---

## 1. Forçando o `/nexus` (ou um pipeline) no modo default

No modo normal (sem digitar `/nexus`), o `CLAUDE.md` já manda "para pipeline multi-agente,
prefira `/nexus`". Mas você reforça isso com gatilhos explícitos:

**Gatilhos que pedem orquestração:**
- "monte um **pipeline** para…"
- "rode **\<agente A\>** e **\<agente B\>** **em paralelo** e depois passe pelo **crivo**"
- "isso toca código, testes e segurança — **orquestre com o nexus**"
- "trate como **risco alto**: quero o Crivo no opus, verificação profunda"
- "quero **gate de revisão** depois de cada mudança"

**A forma mais limpa é simplesmente chamar `/nexus`:**
```
/nexus implementar <feature>, com testes e revisão de segurança, sem mexer no schema
```
Aí o orquestrador faz ANALYZE → PLAN → **CONFIRM** (te mostra a tabela do pipeline) →
EXECUTE → REPORT. Você aprova o plano antes de rodar. Ele **nunca pula o CONFIRM** e
**nunca pula o Crivo** depois de um agente gated.

## 2. Pedindo a forma certa de execução

Dentro de um pipeline você pode exigir explicitamente:

- **Paralelismo:** *"Limpio e Escudo são independentes aqui — rode em paralelo."* O Nexus
  usa `parallel(...)` para agentes independentes e encadeia os dependentes.
- **Gates e risco:** *"a migration é risco alto"* → o Crivo roda em `opus` com verificação
  profunda (lê código, git, arquivos relacionados). *"é um refactor isolado, risco baixo"* →
  Crivo em `sonnet`, revisão leve. **Na dúvida, é risco alto.**
- **Retry e HALT:** o loop de gate já re-tenta o agente com o feedback do Crivo (até 2x); se
  continuar `BLOCKED`, ele **para aquele ramo e reporta o HALT** em vez de seguir em silêncio.
  Você pode pedir: *"se o Crivo bloquear duas vezes, pare e me mostre o porquê."*
- **Pesquisa primeiro:** *"se depender de lib nova, rode o Quaero antes de implementar."* O
  Nexus coloca o Quaero up-front quando o caminho é incerto.

## 3. Quando o `/nexus` deve cair no Workflow tool

O Nexus usa o **Workflow tool** (execução determinística em background) para qualquer
pipeline com **≥2 agentes** ou **qualquer agente gated**. Você não precisa autorizar de novo —
invocar `/nexus` já autoriza. Só para trabalho trivial (1 agente não-gated) ele faz uma
chamada direta. Se quiser garantir a rota pesada, diga "isso tem vários passos com gate" — e
ele orquestra via Workflow (ordering determinístico, paralelismo real, o loop Crivo+retry em
código, e as saídas intermediárias dos agentes ficam fora do contexto principal).

## 4. Escala: peça o pipeline **mínimo** que resolve

O erro mais comum não é pedir de menos — é pedir de mais. Pipeline inchado custa tokens e
gera *echo* (vários agentes re-sinalizando a mesma coisa). Espelhe a tabela de tiers do Nexus:

| Tarefa | Pipeline certo |
|---|---|
| typo / 1 linha / rename | modo direto — 1 agente, sem gate |
| bug isolado | 1 agente + 1 Crivo (geralmente risco baixo) |
| feature | Limpio + Testudo (+ Escudo só se toca auth/dados) + gates |
| mudança ampla / auditoria | o pipeline largo |

E **um dono por preocupação**: "revisão de segurança" → só Escudo, não Limpio + Rufus +
Escudo no mesmo arquivo. Se quiser enxugar, diga no prompt: *"use o mínimo de agentes; um
dono por preocupação."*

## 5. Padrões de qualidade que dá para exigir (Workflow / escala)

Quando o trabalho é de escala (auditar tudo, achar todos os X), você pode pedir explicitamente
os padrões que tornam um Workflow exaustivo e confiável:

- **Verificação adversarial:** *"para cada achado, rode verificadores independentes tentando
  refutá-lo; só mantenha o que sobrevive à maioria."* Mata falso-positivo plausível.
- **Verificação por lentes diversas:** *"verifique cada bug por três ângulos — correção,
  segurança, reprodutibilidade."* Pega modos de falha que revisores idênticos não pegam.
- **Loop-until-dry:** *"continue procurando até 2 rodadas seguidas não acharem nada novo."*
  Pega a cauda que um "top-N" perderia.
- **Varredura multi-modal:** *"procure por contêiner, por conteúdo, por entidade e por tempo —
  cada varredura cega às outras."*
- **Completeness critic:** *"no fim, um agente pergunta o que ficou de fora — modalidade não
  rodada, alegação não verificada, fonte não lida."*
- **Sem corte silencioso:** *"se limitar a top-N ou amostrar, me diga o que foi deixado de
  fora."*

Escale ao pedido: "ache bugs" → poucos finders, 1 voto. "audite a fundo / seja exaustivo" →
pool maior de finders, 3–5 votos adversariais, estágio de síntese.

> ⚠️ O Workflow pesado pode gastar **muitos** tokens (dezenas de subagentes). Só engate essa
> rota quando o tamanho do problema justifica, e diga isso no prompt ("seja exaustivo, custo
> não é o limite" vs "rápido, só o óbvio").

## 6. Frases-modelo (copie e adapte)

- **Forçar pipeline com gate:** *"/nexus \<tarefa\>. Quero gate de revisão (Crivo) depois de
  cada mudança; trate \<X\> como risco alto."*
- **Forçar paralelismo:** *"esses passos são independentes — rode em paralelo e só sintetize
  no fim."*
- **Forçar pesquisa antes:** *"antes de implementar, use o Quaero para comparar \<libs\> e
  recomendar; só então o Limpio implementa."*
- **Forçar varredura exaustiva:** *"use a workflow: varra todo o `src/` atrás de \<X\>,
  verifique cada achado adversarialmente em 3 votos, e me dê só os confirmados. Seja
  exaustivo."*
- **Evitar superdimensionar:** *"isso é trivial — resolve direto, sem pipeline."*

---

Próximo: [`06-memorias-e-sessoes-longas.md`](06-memorias-e-sessoes-longas.md) — persistência e
gestão de contexto. Para os prompts prontos, vá direto ao
[`07-prompts-dificeis-e-receitas.md`](07-prompts-dificeis-e-receitas.md).
