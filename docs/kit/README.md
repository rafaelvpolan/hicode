# docs/kit — Guias do framework Nexus (referência)

Estes são os guias originais do kit **Nexus** (antes distribuído como `prompter-main`), agora
**adaptados para dentro do hicode**. Servem como **referência** sobre os agentes, o orquestrador
`/nexus`, prompting no Opus 4.8, memórias e o modo long-run.

> ⚠️ **O modelo operacional do hicode** (o loop autônomo, os cards, o pipeline
> executar→preview→polir, a verificação por MCP de banco e o dashboard) está em **`plano/00..05`**
> e no **`CLAUDE.md`** da raiz — essa é a autoridade. Onde estes guias divergirem do plano do
> hicode, **vale o plano**.

| Guia | Sobre | Status no hicode |
|---|---|---|
| `01-instalacao.md` | Como instalar o kit (copiar agentes/skill) | Já adaptado: os agentes vivem em `.claude/agents/`, a skill em `.claude/skills/nexus/`. |
| `02-catalogo-de-agentes.md` | O que cada um dos 15 agentes faz | **Atual** — referência direta do catálogo. |
| `03-prompting-opus-4.8.md` | Como pedir bem em cada nível de potência | **Atual**. |
| `04-default-vs-nexus.md` | Diferença entre modo default e `/nexus` | **Atual**. |
| `05-forcando-nexus-e-workflows.md` | Como forçar o melhor workflow | **Atual**. |
| `06-memorias-e-sessoes-longas.md` | Memórias e quando recomeçar a sessão | **Atual**. |
| `07-prompts-dificeis-e-receitas.md` | Playbook de prompts difíceis + receitas | **Atual**. |
| `08-long-run-autonomo.md` | Modo long-run (5h + retomada) | **Parcial** — o hicode usa um heartbeat **stateless** (cron/Actions) como motor; o relauncher `--resume` é secundário e fora da v1 (ver `plano/05`). |
| `09-boas-praticas-de-comentarios.md` | Política Clean Code + hook que a impõe | **Atual** — o hook está em `.claude/hooks/block-comments.mjs`. |

> Nota: alguns caminhos citados nesses guias apontam para a localização antiga do kit
> (`~/.claude/...` ou `prompter/...`). No hicode, os equivalentes estão sob `.claude/` deste repo.
