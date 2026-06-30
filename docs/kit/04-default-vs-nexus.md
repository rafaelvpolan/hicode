# 04 — Default × Nexus: a diferença, sem mistério

Esta é a dúvida que mais confunde quem chega. Os dois usam **os mesmos agentes**. A
diferença **não** está em "agentes melhores" — está em **como o trabalho é orquestrado**.

> **Default** = o Claude do loop principal decide na hora, turno a turno, quem chamar.
> **Nexus** = um orquestrador que planeja o pipeline inteiro, te mostra, confirma, e
> executa de forma determinística com gates obrigatórios.

Analogia: no **default**, você dirige e o GPS (o `CLAUDE.md`) sugere o agente certo a cada
cruzamento. No **`/nexus`**, você aprova a rota inteira no início e o piloto automático
executa, parando nos checkpoints obrigatórios (os gates do Crivo).

---

## Lado a lado

| | **Default** (loop principal + roteamento) | **`/nexus`** (orquestrador) |
|---|---|---|
| Quem planeja | O Claude, implícito, turno a turno | O Nexus, explícito, numa fase PLAN |
| Escolha dos agentes | Ad hoc, conforme a conversa anda | Seleção do catálogo, ordenada por dependência |
| Confirmação antes de agir | Não há etapa obrigatória | **CONFIRM obrigatório** — mostra a tabela do pipeline e espera seu OK |
| Gate Crivo | *Instruído* pelo `CLAUDE.md` (best-effort: depende do Claude lembrar) | **Codificado** como loop de veredito + retry (até 2x) + HALT |
| Determinismo | Nenhum — cada turno é uma decisão nova | Alto — roda via Workflow tool, ordem fixa |
| Paralelismo | Possível, mas improvisado | Real, via `parallel()` para agentes independentes |
| Contexto | Saída de cada agente **volta** ao contexto principal (incha) | Saídas intermediárias ficam no script; só o **REPORT** volta |
| Overhead | Baixo, começa rápido | Maior (analisa, planeja, confirma, orquestra) |
| Execução | Em primeiro plano, interativa | Em background; te re-invoca ao terminar |

---

## O que acontece no **default**

Você manda uma mensagem. O Claude do loop principal lê, e — por causa do bloco de
roteamento no `CLAUDE.md` — decide se faz ele mesmo (trivial) ou delega a **um** agente
(trabalho de domínio). Ele pode até chamar dois agentes num turno. Mas:

- **Não há plano apresentado nem confirmação.** Ele anuncia e já vai.
- **O gate Crivo é "best-effort".** O `CLAUDE.md` diz "passe resultado gated pelo crivo",
  mas isso depende do Claude seguir a instrução — não é um trilho mecânico.
- **A decisão é turno a turno.** Se a tarefa muda de forma no meio, ele se adapta — o que é
  ótimo para trabalho exploratório e ruim para garantir um processo repetível.
- **As saídas dos agentes voltam para o contexto da conversa** — prático para você ver tudo,
  mas infla o contexto rápido em pipelines grandes.

**O default é ideal para:** 1 agente; uma sequência curta e óbvia de 2; exploração; quando
você quer manter a mão no volante e ir ajustando a cada passo.

> Detalhe importante: o próprio `CLAUDE.md` manda o default **preferir `/nexus`** quando a
> tarefa vira um pipeline de verdade. Ou seja, no default, para trabalho pesado, o caminho
> certo é o próprio Claude **chamar o `/nexus`** — não tentar orquestrar tudo na unha.

## O que acontece no **`/nexus`**

Cinco fases, sempre nesta ordem:

1. **ANALYZE** — lê seu pedido, roda `git status`/`git diff`, inspeciona os arquivos, e
   identifica os tipos de tarefa.
2. **PLAN** — seleciona os agentes do catálogo, ordena por dependência, **insere um gate
   Crivo depois de cada agente gated**, e marca o que pode rodar em paralelo.
3. **CONFIRM** — mostra o pipeline como tabela (agente, motivo, gated?, depende-de) e
   **espera você aprovar, ajustar ou cancelar**. Nunca pula esta fase.
4. **EXECUTE** — roda. Para qualquer pipeline com ≥2 agentes ou qualquer agente gated, usa o
   **Workflow tool**: ordem determinística, paralelismo real, e o loop Crivo+retry escrito em
   código (se o Crivo bloquear 2x, dá HALT no ramo e reporta em vez de seguir em silêncio).
5. **REPORT** — do objeto estruturado que o Workflow devolve, monta o relatório final:
   resumo por agente, vereditos do Crivo, arquivos alterados, HALTs e pendências.

**O `/nexus` é ideal para:** tarefas que tocam várias preocupações (código + teste +
segurança + doc), gates sérios, paralelismo, e qualquer coisa que você quer rodar "de uma
vez" com revisão **garantida** e o contexto principal limpo.

---

## Como decidir, em 5 segundos

```
A tarefa é trivial / é uma dúvida / é exploração?          → DEFAULT (o Claude faz/explora)
É UMA preocupação de domínio, fechada?                      → DEFAULT (delega a 1 agente; feche com crivo)
São VÁRIAS preocupações, ou precisa de gate/paralelismo?    → /NEXUS
Quero ver e aprovar o plano antes de rodar?                 → /NEXUS (a fase CONFIRM é isso)
Quero rodar pesado sem inflar o contexto da conversa?       → /NEXUS (saídas ficam no Workflow)
```

E o critério mais simples de todos: **se você consegue descrever o trabalho como "primeiro
A, depois B em paralelo com C, revisando cada um" — isso é um pipeline, vá de `/nexus`.** Se
é "faz X", é default.

---

## Erros comuns

- **Usar default para um pipeline de 4 agentes** → vira um prompt gigante sem confirmação e
  sem gate garantido. Suba para `/nexus`.
- **Usar `/nexus` para um typo** → overhead de análise/plano/confirmação que não se paga. O
  próprio Nexus tem "modo direto" pra isso, mas nem chame — peça direto.
- **Achar que `/nexus` "pensa melhor"** → não. Mesmos agentes, mesmo modelo. O que ele
  entrega a mais é **processo**: confirmação, gates mecânicos, determinismo e contexto limpo.

---

Próximo: [`05-forcando-nexus-e-workflows.md`](05-forcando-nexus-e-workflows.md) — como
garantir que o melhor workflow seja usado.
