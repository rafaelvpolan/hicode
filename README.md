# hicode

Gerenciador de projetos **autônomo** para desenvolvimento com IA. Funde **Loop Engineering**
(você desenha o loop que prompta os agentes, em vez de promptar você mesmo) com o framework
**Nexus** (15 agentes de escopo estreito + o gate adversarial **Crivo**).

> **Você não prompta os agentes — você desenha o loop que os prompta.** Cada unidade de trabalho é
> um **card** em disco; um **heartbeat** descobre trabalho; um **harness** roda o pipeline de
> agentes por card, mostra o **preview** do resultado, fecha o ciclo verde lendo **exit codes reais
> do disco**, verifica no **banco** (MCP read-only) e abre o **PR**. *O repo lembra; a conversa esquece.*

## Pipeline

**Executar primeiro, polir depois:**

```
Fase 1 (EXECUTAR):  tarefa → executar → PREVIEW (você vê o resultado) → aprovar
Fase 2 (POLIR):     melhorar arquitetura → testes/lint/ts → segurança → code-review → limpeza
                    → PR (humano) → Deploy
```

A única porta humana obrigatória é o **merge do PR**; a aprovação do preview é uma porta leve e
cedo (auto para mudanças sem superfície visual).

## Estado atual

🟡 **Em planejamento.** O **plano completo** está em [`plano/`](plano/):

| Doc | Conteúdo |
|---|---|
| [`plano/00-resumo-executivo.md`](plano/00-resumo-executivo.md) | Visão geral, pipeline, portas humanas, decisões |
| [`plano/01-analise-metodologias.md`](plano/01-analise-metodologias.md) | Loop Engineering × Nexus |
| [`plano/02-arquitetura.md`](plano/02-arquitetura.md) | Card, máquina de estados, loop, preview, MCP, dashboard, segurança |
| [`plano/03-decisoes.md`](plano/03-decisoes.md) | Decisões (tomadas + abertas) |
| [`plano/04-roadmap.md`](plano/04-roadmap.md) | Fases 0–5, incrementais |
| [`plano/05-riscos-e-ajustes.md`](plano/05-riscos-e-ajustes.md) | Lacunas, ajustes, riscos residuais |

## Estrutura

```
.claude/agents/      15 agentes Nexus (crivo estendido p/ gate de spec + review de diff)
.claude/skills/      nexus/ (orquestrador manual); skills do hicode entram nas próximas fases
.claude/hooks/       block-comments.mjs (Clean Code) + long-run/ (toolkit, secundário)
.claude/settings.json  permissões (acceptEdits + denylist) + hook de comentários
CLAUDE.md            autoridade de instrução: princípio "executar primeiro", roteamento, segurança
docs/kit/            guias de referência do framework Nexus
plano/               o plano deste projeto
METODOLOGIA.md       o artigo de Loop Engineering (fonte)
```

## Próximo passo

Construir a **Fase 0 → 1** (ver [`plano/04-roadmap.md`](plano/04-roadmap.md)): o card, o harness
mínimo, o mecanismo de **preview** e o dashboard — provando o fluxo `executar → preview → aprovar
→ PR` num primeiro tipo de tarefa.
