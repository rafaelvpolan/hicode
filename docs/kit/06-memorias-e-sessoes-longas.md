# 06 — Memórias e sessões longas

Dois lados da mesma moeda: **gestão de contexto** (quando limpar a bancada e recomeçar) e
**persistência** (o que sobrevive entre sessões, e como usar isso a seu favor).

---

## Parte A — Sessões de longa duração: quando parar e começar do zero

O Opus 4.8 aqui tem **1M de tokens** e o harness **resume o contexto automaticamente** quando
a conversa cresce — então você quase nunca é *obrigado* a parar. Mas qualidade ≠ capacidade:
conforme o contexto enche de ruído (explorações que não deram em nada, abordagens
abandonadas, saídas longas de ferramentas), a atenção ao que importa **piora**.

### Sinais de que é hora de uma sessão nova (livre de histórico)

- O modelo **se repete**, re-deriva decisões já tomadas, ou **contradiz** algo decidido antes.
- Você **mudou o rumo** da tarefa — o começo da conversa agora é irrelevante ou enganoso.
- O histórico está cheio de **tentativas falhas** que não importam mais.
- Você acabou de bater um **marco natural** (feature mergeada, fase concluída).
- O contexto foi **resumido automaticamente** e o resumo perdeu algo que você precisa.
- Ele começa a **"esquecer" restrições** que você deu lá no início.

### Regra de bolso
> Uma sessão nova com um handoff de 5 linhas vence uma sessão de 200 mensagens carregando peso
> morto. Trate o contexto como uma bancada: **limpe entre os trabalhos.**

### Como recomeçar limpo (o handoff)

1. **Garanta o trabalho:** commit / salve o que está pronto.
2. **Escreva o handoff.** Use a skill `remember` — neste projeto existe a pasta `.remember/`
   que guarda o estado da sessão (buffer, diário, recentes, memórias-chave) justamente para
   continuar limpo depois (ver Parte B).
3. **Salve as decisões duráveis na memória** (Parte B) — assim a sessão nova já nasce sabendo
   das convenções e escolhas.
4. **Abra a sessão nova com um prompt curto de contexto:**
   ```
   Contexto: estamos em <feature/módulo>. Já feito: <X, Y>. Decisões firmadas: <Z>.
   Próximo passo: <W>. Restrições: <A, B>. Detalhes em .remember/ e no CLAUDE.md.
   ```

### Por que delegar já ajuda nisso
Cada subagente (e cada pipeline do `/nexus`) **começa com contexto limpo** — ele não carrega a
sua conversa inteira. Por isso delegar trabalho pesado a um agente, em vez de fazer tudo no
loop principal, **mantém o contexto principal enxuto** e adia a necessidade de recomeçar.

---

## Parte B — Memórias: como funcionam e como usar a seu favor

Existem **três** sistemas de memória, com propósitos diferentes. Confundi-los é o que faz
gente achar que "memória não funciona". Entenda os três e cada um vira uma alavanca.

| Sistema | Onde vive | Escopo | Para quê |
|---|---|---|---|
| **Memória de agente** | `~/.claude/agent-memory/<agente>/` | Por agente, sua máquina, todos os projetos | O agente fica mais afiado naquele codebase a cada uso |
| **Memória do assistente** | `~/.claude/projects/<projeto>/memory/` | Por projeto, loop principal | Fatos duráveis: quem você é, como prefere, decisões do projeto |
| **`.remember/` (handoff)** | `<repo>/.remember/` | Por sessão | Continuar de onde parou numa sessão nova (Parte A) |

Os dois primeiros guardam **fatos duráveis**. O terceiro guarda **continuidade de sessão**.

### 1. Memória de agente — a que mais rende

Todos os 15 agentes deste kit têm `memory: user` no frontmatter. Na prática, cada agente tem
uma pasta própria em `~/.claude/agent-memory/<agente>/` com um índice `MEMORY.md` e **um
arquivo por fato**. Os arquivos usam frontmatter (`name`, `description`, `metadata.type`).

**Isso não é teoria — já está acontecendo.** Exemplos reais da máquina do dono:

- **escudo/** guarda achados de segurança por projeto. O índice tem entradas como:
  *"@podium/asaas core + webhooks: revisado 2026-06-23; fixes: idempotency key (Medium),
  token timing side-channel (High), SSRF blocklist gaps (High); aberto: PII em debug logger."*
  Na próxima revisão daquele projeto, o Escudo **já chega sabendo** onde olhar e o que ficou
  aberto.
- **crivo/** guarda lições de revisão. Uma delas (resumida): *"ao revisar fix de integridade
  de dados em Laravel, não confie só no diff do controller — rastreie todo write-path,
  incluindo hooks `booted()/creating/saving` e Observers, que reintroduzem o valor que o fix
  tentou suprimir."* Essa lição, aprendida uma vez, melhora **todas** as revisões futuras.

**Como funciona o ciclo:**
- **Gravação:** os agentes atualizam a própria memória quando descobrem padrões, convenções,
  hotspots, anti-padrões — está escrito no system prompt de cada um (seção "Memory").
- **Recall:** no início da execução de um agente, as memórias relevantes voltam
  automaticamente para o contexto dele (você as vê citadas em blocos de contexto).

**Como usar a seu favor:**
- **Deixe compor.** Quanto mais você usa um agente num codebase, mais afiado ele fica. Não
  resete a pasta dele à toa — é conhecimento institucional acumulado.
- **Semeie no começo do projeto.** *"escudo, lembre que neste projeto a auth fica em
  `src/middleware/auth.ts` e que tokens expiram em 15min."* Ele grava e reusa.
- **Corrija quando errar.** *"crivo, lembre que aqui migrations sempre precisam de rollback
  testado — bloqueie se faltar."* Vira regra permanente daquele agente.
- **Atenção (time):** essa memória é **por máquina e NÃO vem no kit**. Quem instalar começa
  com memória de agente **vazia** — ela enche conforme a pessoa trabalha. Se você quer que um
  colega comece com uma lição específica, **mande o fato** e peça pro agente lembrar.

### 2. Memória do assistente (loop principal) — por projeto

É a memória do Claude do loop principal, separada por projeto, em
`~/.claude/projects/<projeto>/memory/` com um `MEMORY.md` de índice (criada sob demanda no
primeiro fato que valha guardar). Quatro tipos:

| Tipo | Guarda | Exemplo |
|---|---|---|
| `user` | quem você é | "Dev backend sênior, foco em TS/Laravel" |
| `feedback` | como você quer que o Claude trabalhe | "Sempre rode o lint antes de dizer que está pronto" |
| `project` | trabalho/restrições em curso não óbvios pelo código | "Estamos migrando do Asaas v2 para v3 até ago/2026" |
| `reference` | ponteiros externos | dashboards, tickets, URLs de doc |

**Como usar a seu favor:**
- **Salve o que você se cansa de repetir.** Preferências de estilo, convenções de PR, "não use
  a lib X". Vira default sem você reescrever toda sessão.
- **Salve decisões de projeto que o código não conta.** "Por que escolhemos Y" não está no
  diff — está na sua cabeça. Memória de projeto é o lugar.
- **Não polua.** Não salve o que o repo já registra (estrutura, git, `CLAUDE.md`) nem o que só
  importa nesta conversa.
- **Desconfie e verifique.** Memória reflete o que era verdade quando foi escrita. Se ela cita
  um arquivo/flag, confirme que ainda existe antes de agir em cima.

> `CLAUDE.md` × memória: o `CLAUDE.md` é **instrução que sempre vale** (regras, roteamento).
> A memória é **fato/preferência que o Claude recorda quando relevante**. Regras firmes →
> `CLAUDE.md`. Conhecimento que se acumula → memória.

### 3. `.remember/` — continuidade de sessão

Não guarda "fatos", guarda **o estado da sessão** para você recomeçar limpo (Parte A). Neste
repo a pasta `.remember/` já existe. A skill `remember` escreve o handoff. Use **antes de
encerrar uma sessão longa** para que a próxima nasça sabendo onde você parou.

---

## Qual usar quando

```
"Esse agente devia lembrar de um padrão deste codebase"        → memória de AGENTE (semeie/corrija)
"O Claude devia parar de me perguntar X / repetir Y"           → memória do ASSISTENTE (feedback)
"Uma decisão/restrição de projeto que o código não mostra"     → memória do ASSISTENTE (project)
"Vou fechar a sessão e quero continuar limpo depois"           → .remember (handoff)
"Uma regra que SEMPRE tem que valer"                           → CLAUDE.md (não é memória — é instrução)
```

## Três hábitos que multiplicam o resto do kit

1. **Semeie cedo.** No primeiro dia num projeto, conte aos agentes as convenções e a fronteira
   ("não toque em X"). Eles gravam e param de errar isso.
2. **Corrija uma vez, não toda vez.** Quando um agente erra um padrão, peça pra ele lembrar.
   Da próxima já vem certo — pra você e pros pipelines do `/nexus`.
3. **Limpe a sessão, preserve a memória.** Recomeçar a conversa **não** apaga as memórias —
   elas são duráveis. Você descarta o ruído da sessão e mantém o conhecimento.

---

Próximo: [`07-prompts-dificeis-e-receitas.md`](07-prompts-dificeis-e-receitas.md) — o playbook
prático: prompts dúbios, prompts longos e receitas prontas, com exemplos.
