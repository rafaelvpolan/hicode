# Testar integracao local e aprovar o prompt

O plano do Claude em `docs/claude/` permanece como base implementada. HII executa; Hicode gerencia arquivos, tarefas e decisoes humanas.

## Atualizar

Em cada repositorio, revise alteracoes locais antes de atualizar:

```bash
git status --short
git switch main
git pull --ff-only origin main
bun install --frozen-lockfile
```

Use a versao Bun indicada em `.bun-version` do HII. No Hicode, instale tambem em `panel/`:

```bash
cd panel
bun install --frozen-lockfile
```

Configure no backend do Hicode `HII_API_URL`, `HII_API_TOKEN`, `HII_API_REPO`, `HICODE_PANEL_PASSWORD` e `HICODE_SESSION_SECRET` conforme o README. O token e do motor; nao o exponha no navegador. A fila do Hicode e do HII deve corresponder ao mesmo projeto.

## Preparar o projeto e executar

No HII:

```bash
hii init /caminho/do/projeto
hii projetar /caminho/do/projeto claude
hii projetar /caminho/do/projeto codex
export HII_PROMPT_PRIMEIRO=on
export HII_QUOTA_FALLBACK=perguntar
export HII_CARD_BUDGET_USD=5
export HII_CARD_BUDGET_TOKENS=200000
hii restart
hii
```

No Hicode:

```bash
bun run panel
```

Abra `/motor`, autentique e crie um pedido ou use **Abrir tarefa** com seu ID. O pacote aparece antes de qualquer atividade de IA. Escolha a IA, aplique o modelo da implementacao, leia o prompt e clique em **Aprovar e executar**. Enquanto ha modelo digitado ainda nao aplicado, a aprovacao fica bloqueada. O painel preserva o texto digitado durante atualizacoes e recupera a tarefa selecionada depois de recarregar.

Na TUI, `/pacote <id>` mostra o mesmo pacote persistido; use o canal de respostas para aprovar ou ajustar. Mudancas no prompt, regras, IA/modelo ou contrato exigem nova revisao.

## Ollama opcional

Instale/inicie o Ollama local e escolha um modelo de ferramentas instalado que caiba no hardware:

```bash
ollama list
export HII_OLLAMA_URL=http://localhost:11434
export HII_CLAUDE_OLLAMA_MODEL=nome-do-modelo-instalado
export HII_CODEX_OLLAMA_MODEL=nome-do-modelo-instalado
```

Selecione `claude-ollama` ou `codex-ollama`; `claude` e `codex` continuam usando seus provedores nativos. O motor valida o catalogo e o orcamento de memoria antes de carregar o modelo. O teto conservador padrao e 80% da RAM; `HII_OLLAMA_MEMORY_BUDGET_MB` permite declarar capacidade local adicional comprovada. Nenhuma troca de modelo ocorre automaticamente por falta de memoria ou cota.

A memoria compartilhada fica em `.hii/memory/`; papeis, skills e execucoes ficam separados em `.hii/ia/<ia>/`. Claude projeta em `CLAUDE.md` e `.claude/`; Codex usa `AGENTS.md` e `.agents/skills/`. Atualizacoes gerenciadas preservam edicoes humanas.

Custos nao reportados continuam desconhecidos. O limite em tokens continua ativo; o teto monetario nao garante faturamento maximo de um provedor sem medicao. VPS fica fora deste piloto.

## Regressao automatizada do painel

```bash
bun run test
bun run test:e2e:prompt
bun run test:e2e:status
```

O teste de prompt usa backend e projetos temporarios, valida a aprovacao sem atividade previa, a escolha de modelo sem execucao, a preservacao de texto durante atualizacoes e a recuperacao apos reload. Nenhuma IA paga e chamada.

## Evidencias da entrega — 2026-10-05

Typecheck, lint:types e 220 testes isolados aprovados com o contrato HII atual.
Os testes de navegador verificam abertura do prompt sem atividades, escolha de
IA/modelo sem executar, preservacao do modelo durante polling, recusa temporaria
da API sem liberar aprovacao, aprovacao com pergunta/ETag e persistencia apos
reload. Desktop e 390px sem overflow ou erros JavaScript.

Observabilidade e recuperacao entre processos separados aprovadas, incluindo
card 025 com plano/checkpoint e card 020 duplicado preservados. Status/versao do
motor aprovados sem depender de SSE. O CI fixa o commit HII correspondente.
Fixtures nao executam IA real nem alteram os servicos do operador. Inferencia
real com Ollama permanece limitada pela carga/memoria observada nesta maquina;
a suite confirma o protocolo e o preflight, nao a qualidade de um modelo local.
