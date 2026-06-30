# 08 — Long-Run Autônomo: Operação 12h Desacompanhado

---

## ⭐ COMECE AQUI

Este é um **guia conceitual e técnico**. Para **setup prático passo-a-passo**, abra:

**→ `/home/douglas/projetos/prompter/long-run/SETUP-PASSO-A-PASSO.md`**

Neste arquivo:
1. Validação de ambiente (jq, credentials)
2. 10 passos práticos (com comandos prontos)
3. Testes antes de iniciar 12h
4. Troubleshooting

Se quiser entender a **arquitetura e conceitos** antes de começar, leia este doc (08). Se quiser **ir direto ao setup**, abra o guia passo-a-passo.

---

**Quando usar:** Você precisa que o Claude Code execute uma **tarefa bem-definida, com escopo fechado, por até 12 horas**, sem intervenção humana — enquanto você dorme, viaja ou trabalha em outra coisa.

**Quando NÃO usar:** O escopo é vago ("melhore o projeto"). Você precisa de decisões de arquitetura em tempo real. A tarefa envolve operações potencialmente destrutivas (deploy, migrations, deletar código) sem pré-aprovação. Você não tem sandbox/escopo bem definido.

---

## O que é o "long-run autônomo"

Um modo operacional onde o Claude Code:
- **Começa uma sessão** com plano, escopo e restrições explícitos.
- **Trabalha iterativamente** por até 5 horas (a janela de rate limit de usuários Pro/Max).
- **Monitora seu próprio consumo** de tokens a cada ~30 minutos.
- **Para automaticamente aos 90%** da quota de 5 horas (antes de bater o teto e ser forçado a parar).
- **Grava checkpoint** com estado, progresso, próximos passos e todas as decisões de configuração.
- **Aguarda reset externo** (fora do modelo — via cron/while-loop) que detecta quando a janela resetou.
- **Retoma exatamente de onde parou,** lendo o checkpoint, e repete o ciclo.

**Ciclo total:** 5h (trabalho) + ~30min (transição) + 5h (trabalho) + ... até tarefa estar pronta.

---

## Visão Geral: O Loop de 5h + Retomada

```
SESSÃO 1 (t=0 a t=5h)
├── Início: ler memória de longrun → gravar decisões no settings.json → começar tarefa
├── 0–5h: trabalhar, iterações normais
├── ~4:30h: hook PreToolUse começa a sinalizar que uso está em 80%
├── ~4:45h: quando uso bate 90%, PreToolUse bloqueia tools → marca pausa em memória
├── Fim: salvar state, checkpoint, próximos passos na memória de longrun
└── Sessão encerra (atingiu 90% da quota)

[5h–30min depois: relauncher externo detecta reset via OAuth]

SESSÃO 2 (t=5.5h a t=10.5h)
├── Início: relauncher externa re-lança `claude --resume` + lê memória de longrun
├── Retomar: modelo injeta contexto via hook SessionStart
├── 5.5h–10.5h: continua tarefa de onde parou
├── ~10h: novamente ao 90%, para
└── Sessão encerra

[mais 30min de espera pelo reset]

SESSÃO 3 (t=10.5h+)
└── Se tarefa não terminou, novo ciclo
```

---

## Parte A — Auto Mode On: Setup Inicial

Antes de rodar, **você responde um checklist de 8 perguntas**. As respostas são gravadas na **memória de longrun** e no `settings.json`, criando o "contrato" da sessão.

### Auto-Mode Checklist (obrigatório)

Leia e preencha `/home/douglas/projetos/prompter/long-run/auto-mode-checklist.md` **antes de começar**. Exemplos de perguntas:

1. **Qual é o escopo exato?** (ex: "refatorar Controller X em Laravel para ser stateless")
2. **Qual é o critério de "pronto"?** (ex: "testes passam + 90% de cobertura + code review do Crivo")
3. **Qual é seu budget de tokens para essa tarefa?** (padrão: 500k; máximo: 2M para Opus 4.8 em Pro Max)
4. **O que é "90% da quota"?** (calculado a partir do budget; ex: se 500k é o budget, parar aos 450k)
5. **Com que cadência monitorar uso?** (padrão: a cada 30min; ajuste se tarefa é mais urgente)
6. **Se houver ambiguidade, fazer o quê?** (ex: "parar e alertar" vs. "tentar inferir, continue")
7. **Denylist customizada?** (itens além da recomendada para bloquear nesta tarefa? ex: "bloqueia `npm publish`")
8. **Condição de parada além de 90%?** (ex: "parar se tarefa terminar antes")

→ Use o checklist em `long-run/auto-mode-checklist.md`.

### Gravar Decisões: Memória de Longrun

Crie o arquivo `~/.claude/longrun-memory.md` (use o template em `long-run/longrun-memory.template.md`):

```markdown
# Memória de Long-Run

**Tarefa:** refatorar Controller X em Laravel...
**Escopo:** apenas Controller X e seus testes
**Critério de "pronto":** testes passam, 90% cobertura, Crivo aprova
**Budget:** 500k tokens por sessão
**Threshold de parada:** 450k (90% de 500k)
**Cadência de check:** a cada 30min
**Ambiguidade:** parar e alertar

## Decisões de Auto-Mode

- Modo permissão: `acceptEdits`
- Denylist: padrão + `Bash(npm publish *)`
- Detecção de quota: cron `watch-usage.sh --write` → /tmp/claude_usage_current.json (heurística por budget)
- Retomada: via relauncher cron com `--resume`

## Plano (checkpoints)

1. [ ] Explorar estrutura de Controller X
2. [ ] Identificar estado compartilhado (anti-padrão de stateless)
3. [ ] Refatorar métodos para DI
4. [ ] Escrever testes novas de stateless
5. [ ] Cobertura para 90%+
6. [ ] Passagem pelo Crivo

## Progresso

- Sessão 1 (t=0–5h): Checkpoint 1–2 feitos, iniciado Checkpoint 3. Estado do refator em `docs/refactor-state-session1.md`.

## Estado de Pausa/Retomada

- **Última pausa:** em Checkpoint 3.2 ("refatorar método authenticate()")
- **Arquivo em progresso:** `app/Controllers/AuthController.php` linhas 120–180
- **Próxima ação:** continuar com DI em método authenticate(), linha 121

## Denylist Ativa

```json
[git push --force, kubectl, npm publish, DROP TABLE, terraform destroy]
```
```

Hook `SessionStart` injeta esse arquivo em contexto. Relauncher lê e passa.

### Configurar Hooks + Permissões

Cole o bloco de `long-run/settings.hooks.example.json` no seu `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["Read", "Bash(git *)", "Edit"],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push --force *)",
      "Bash(git push origin main *)",
      "Bash(kubectl *)",
      "Bash(DROP TABLE *)",
      "Bash(npm publish *)"
    ],
    "defaultMode": "acceptEdits"
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/long-run/check-usage-gate.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/long-run/inject-longrun-memory.sh"
          }
        ]
      }
    ]
  }
}
```

Veja instruções em `long-run/settings.hooks.example.json` para montar os hooks shell.

### Tirar Todas as Dúvidas Antes de Iniciar

Checklist de validação:

- [ ] Escopo é específico? (não vago como "melhorar código")
- [ ] Critério de pronto é testável? (ex: "testes passam", não "pareça bom")
- [ ] Restrições estão documentadas no checklist?
- [ ] Denylist está no `settings.json` — inclui git push?
- [ ] Memória de longrun está em `~/.claude/longrun-memory.md`?
- [ ] Hooks estão em `~/.claude/` e referenciados no settings.json?
- [ ] Você leu este doc todo, não só a parte A?
- [ ] Você conforta com **12h desacompanhado** — não há intervalo de revisão?

Se todos OK, comece assim:

```bash
# Gravar session ID
SESSION_ID=$(claude -p "Iniciar tarefa conforme plano de longrun. Memória: $(cat ~/.claude/longrun-memory.md)." \
  --permission-mode acceptEdits --output-format json | jq -r '.session_id')

# Salvar ID para relauncher usar depois
echo "$SESSION_ID" > ~/.claude/longrun_session_current

# Iniciar o relauncher em background
nohup ~/.claude/hooks/long-run/relaunch-loop.sh > /tmp/relauncher.log 2>&1 &
```

---

## Parte B — Watch da Janela de 5h: Medição

### Onde Vem o Número de Uso?

A Anthropic **não expõe** oficialmente o "% da janela de 5h" de forma programática. Logo, este kit usa uma **heurística verificável** como padrão e oferece uma alternativa não-oficial:

**Método padrão (verificável, sem endpoint não-documentado) — `watch-usage.sh`:**
conta os tokens das entradas dos transcripts em `~/.claude/projects/**/*.jsonl` (campos
`message.usage`: `input_tokens`+`output_tokens`+`cache_creation_input_tokens`; `cache_read`
é excluído por padrão porque é barato e dominaria a conta) cujo `timestamp` cai nas últimas
5h, e divide por um **BUDGET que você calibra**. O `%` resultante é uma **heurística** — o
limite real do plano não é um número de tokens público. Calibre o budget observando alguns
ciclos. (Por isso NÃO afirmamos que o transcript "mede a cota" — ele estima, e você ajusta.)

**Alternativa [VERIFICAR] — `write-status-from-oauth.sh`:** lê um endpoint OAuth não-oficial
(`/api/oauth/usage`). Pode dar o número do servidor, mas é não-documentado e instável — valide
com `curl` na sua conta antes de confiar.

Ambos escrevem o **mesmo schema canônico** que o gate lê:
```json
{ "used_percentage": 42.3, "tokens_used": 211500, "budget": 500000, "window_hours": 5, "computed_at": "..." }
```

### Mantendo o status FRESCO (essencial)

O gate lê `/tmp/claude_usage_current.json`. Durante o run o uso **sobe**, então o arquivo
precisa ser **reescrito de tempos em tempos** — este é o "monitorar de X em X min". Use **cron**:
```bash
# crontab -e   (este é o watch de X em X minutos)
*/10 * * * * BUDGET=8000000 ~/.claude/hooks/long-run/watch-usage.sh --write
```
O `SessionStart` grava só o valor inicial. **Sem o cron, o status fica velho, o gate lê um valor
defasado (ou 0) e NÃO protege** — ver aviso de falha-aberto na Parte C.

### Output do Watch

```bash
$ BUDGET=8000000 ~/.claude/hooks/long-run/watch-usage.sh --write
Janela de 5h (heurística vs budget):
  Uso: 94.33%  (7547036 / 8000000 tokens-equiv)
  Threshold: 90%
  Status gravado em: /tmp/claude_usage_current.json
  Status: THRESHOLD_EXCEEDED — pare os agentes e faça checkpoint.
```

---

## Parte C — Parar em 90%: Gate Automático

Quando uso chega a 90%, **as tools devem ser bloqueadas**. Isso é implementado no hook `PreToolUse`:

```bash
# ~/.claude/hooks/long-run/check-usage-gate.sh
#!/bin/bash

USED=$(jq -r '.used_percentage // .utilization // 0' /tmp/claude_usage_current.json 2>/dev/null || echo "0")
THRESHOLD=90

if (( $(echo "$USED >= $THRESHOLD" | bc -l 2>/dev/null) )); then
  # Retornar JSON de negação no formato correto
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Quota de 5h atingida ($USED%). Checkpoint salvo. Aguarde reset."
  }
}
EOF
  exit 0
fi

exit 0
```

> O bloco acima é **ilustrativo**. Use o script real do kit (`long-run/check-usage-gate.sh`),
> que: (1) lê o payload do hook via **STDIN** — ler `$HOOK_INPUT` sob `set -u` aborta o script
> e faz o gate **falhar aberto**; (2) lê a chave canônica `.used_percentage`.

**⚠️ FALHA ABERTO (leia):** se `/tmp/claude_usage_current.json` estiver **ausente ou velho**,
o gate assume **0%** e **deixa a tool passar** — ou seja, **sem proteção de 90%**. A proteção só
existe se o **cron do `watch-usage.sh --write` estiver rodando** (Parte B) e o `onTimeout` do hook
não engolir falhas. Confirme `tail -f /tmp/check-usage-gate.log` antes de confiar 12h. Se preferir
falhar **fechado**, troque `onTimeout` para `"deny"` (risco de travar a sessão se o gate ficar lento).

**Limitação crítica (matcher):** o hook só aplica às tools que o matcher seleciona. Se o matcher
é só `"Bash"`, tools como `Edit`/`Write`/`Read` **não são bloqueadas** — continuam após 90%.

**Mitigação recomendada:** registrar matchers para `Bash`, `Edit`, `Write` e `Read` (um por tool),
como no `settings.hooks.example.json` do kit.

**Resultado:** Quando PreToolUse retorna `deny`, o Claude Code para de executar e o modelo reconhece que precisa fazer checkpoint. Você deve gravar na memória de longrun:

```markdown
## Estado de Pausa/Retomada

- **Parada em:** checkpoint C.3 ("refatorar método X")
- **Razão:** uso de quota atingiu 90% (445k / 500k)
- **Hora:** 2026-06-24 14:30 UTC
- **Próxima ação retomada:** continuar refator em app/Controllers/X.php:150
```

Hook `Stop` (ao fim do turno) pode **gravar automaticamente** esse estado. Veja `settings.hooks.example.json`.

---

## Parte D — Retomada: Esperar Reset e Relançar

### Por Que Precisa Processo Externo

Quando a quota de 5h se esgota, o servidor Anthropic responde com HTTP 429 (rate limit). O Claude Code **não roda** com cota zero — ele emite mensagem de erro e para. Não existe mecanismo automático no modelo para "acordar quando a quota resetar".

A **única forma** de retomar é:
1. **Detectar externamente** quando a quota zerou (via OAuth endpoint)
2. **Aguardar o reset** (que acontece 5h após o início da janela)
3. **Relançar a sessão** com `claude --resume`

Essa orquestração precisa ser feita **fora do Claude Code**, via um script que roda continuamente (cron, systemd timer, ou while-loop).

### O Relauncher: Loop Externo

Arquivo: `~/.claude/hooks/long-run/relaunch-loop.sh`

Pseudocódigo (validar campos reais em seu ambiente):
```bash
#!/bin/bash

SESSION_ID=$(cat ~/.claude/longrun_session_current)
LONGRUN_MEMORY="$HOME/.claude/longrun-memory.md"

while true; do
  # [VERIFICAR] Formato exato de ~/.claude/.credentials.json
  # Campo pode ser .oauth_token, .claudeAiOauth.accessToken, ou outro
  # Validar com: jq 'keys' ~/.claude/.credentials.json
  
  TOKEN=$(jq -r '.oauth_token // .claudeAiOauth.accessToken // ""' ~/.claude/.credentials.json 2>/dev/null || echo "")
  
  if [[ -z "$TOKEN" ]]; then
    echo "[$(date)] Erro: token OAuth não encontrado. Verifique ~/.claude/.credentials.json"
    sleep 300
    continue
  fi
  
  # Chamar endpoint OAuth para ver % de uso
  # [VERIFICAR] Endpoint exato e formato de resposta
  UTIL=$(curl -s \
    -H "Authorization: Bearer $TOKEN" \
    -H "User-Agent: claude-code/2.1.187" \
    "https://api.anthropic.com/api/oauth/usage" 2>/dev/null \
    | jq -r '.five_hour.utilization // .five_hour.used_percentage // 100' 2>/dev/null || echo "100")

  # Se uso < 5%, quota zerou, esperar reset ~30min e relançar
  if (( $(echo "$UTIL < 5" | bc -l 2>/dev/null || echo "0") )); then
    echo "[$(date)] Quota zerada (utilization: $UTIL%). Aguardando reset..."
    sleep 1800
    
    echo "[$(date)] Quota resetada. Relançando sessão $SESSION_ID..."
    PROMPT="$(cat "$LONGRUN_MEMORY")"$'\n'"Retomar tarefa conforme checkpoint acima."
    
    claude -p "$PROMPT" \
      --resume "$SESSION_ID" \
      --permission-mode acceptEdits \
      --output-format json 2>&1 | tee -a /tmp/claude_longrun.log
    
    # Atualizar SESSION_ID se o resumo criou nova sessão
    NEW_SESSION=$(tail -1 /tmp/claude_longrun.log 2>/dev/null | jq -r '.session_id // ""' 2>/dev/null || echo "")
    if [[ -n "$NEW_SESSION" && "$NEW_SESSION" != "$SESSION_ID" ]]; then
      echo "$NEW_SESSION" > ~/.claude/longrun_session_current
      SESSION_ID="$NEW_SESSION"
    fi
  fi

  # Checar a cada 5min
  sleep 300
done
```

**[VERIFICAR]** Campos reais de `~/.claude/.credentials.json` — validar com `jq keys` antes de usar. Token pode estar em `oauth_token`, `claudeAiOauth.accessToken`, ou outro campo.

**Iniciar o relauncher em background:**
```bash
nohup ~/.claude/hooks/long-run/relaunch-loop.sh > /tmp/relauncher.log 2>&1 &
```

### Detectar Fim Antecipado

Se a tarefa terminar **antes de 5h**, o relauncher ainda vai rodar. Você pode:
- **Interromper manualmente** quando vir "tarefa concluída" nas logs
- **Ou deixar a memória de longrun com marcador** de conclusão, e o relauncher pode verificar antes de retomar

---

## Parte E — Fonte do Status para o Gate (resumo)

O gate lê `/tmp/claude_usage_current.json`, que **não é criado automaticamente**. Já detalhado
na Parte B — aqui o resumo das duas fontes:

- **Padrão (recomendado, verificável):** cron do `watch-usage.sh --write` a cada X min, que conta
  os tokens dos transcripts vs o seu budget. É o "monitorar de X em X min". Sem esse cron rodando,
  o status fica velho e o gate **falha aberto** (Parte C).
- **Alternativa [VERIFICAR]:** `write-status-from-oauth.sh` (endpoint OAuth não-oficial). Use só
  após validar o endpoint/credenciais na sua conta. Ele normaliza para o mesmo schema canônico.

Sem **uma** das duas mantendo o arquivo fresco, o gate de 90% nunca dispara.

---

## Parte F — A Memória de Longrun: Arquitetura de Checkpoint

Arquivo: `~/.claude/longrun-memory.md`

Structura:

```markdown
# Memória de Long-Run

**Tarefa:** [descrição breve]
**Escopo:** [limite de o quê muda]
**Critério de "pronto":** [testável]
**Budget de tokens:** [N tokens por sessão]
**Threshold:** [% para parar]

## Decisões de Auto-Mode (gravadas do checklist)

- Modo permissão: [acceptEdits]
- Denylist: [lista de bloqueios]
- Cadência de check: [30min]
- Comportamento em ambiguidade: [parar/inferir/etc]
- Condition de parada: [90% ou outro]

## Plano (visão de alto nível)

1. [ ] Tarefa A
2. [ ] Tarefa B
3. [ ] Tarefa C

## Progresso (atualizado a cada checkpoint)

### Sessão 1 (t=0–5h)
- [x] Tarefa A feita
- [x] Tarefa B.1 feita
- [ ] Tarefa B.2 em progresso — arquivo X, linha Y

### Sessão 2 (t=5–10h)
- [x] Tarefa B.2 finalizada
- [x] Tarefa C iniciada
- [x] Testes para C passando
- [ ] Code review pendente

## Estado de Pausa/Retomada (critico para continuidade)

- **Última pausa:** em Tarefa B.2
- **Por quê:** atingiu 90% de quota
- **Hora da pausa:** 2026-06-24 14:30 UTC
- **Arquivo/contexto**: `src/feature.ts` linhas 50–120, função `process()` parcialmente refatorada
- **Próxima ação:** continuar refatoração de `process()` em linha 121, depois testes

## Denylist Ativa (verificado em PreToolUse)

- Bash(rm -rf *)
- Bash(git push --force *)
- Bash(git push origin main *)
- Bash(npm publish *)
- [mais itens customizados]
```

**Quem atualiza?** Idealmente um hook `Stop` (ao fim de cada turno), ou manualmente antes de parar.

**Quem lê?** Hook `SessionStart` injeta em contexto. Relauncher passa como prompt inicial.

---

## Parte G — Segurança e Limitações

### Riscos Reais de 12h Desacompanhado

| Risco | Severidade | Mitigação |
|---|---|---|
| Prompt injection via arquivo hostil | **Alto** | Deny list de operações destrutivas; `acceptEdits` não auto-aprova `rm -rf`. |
| Drift de escopo (sai do repo, instala deps globais) | **Alto** | `acceptEdits` restringe a workdir; deny `npm publish` explicitamente. Validação de escopo no hook. |
| Perda de checkpoint no meio de operação | **Médio** | Gravar checkpoint antes de tool longa; validar estado ao resumir. |
| Subagentes herdam `acceptEdits` sem limite | **Alto** | Subagentes herdam permissões do pai. Assegure-se que todos usam o mesmo denylist. |
| Custo API inesperado | **Médio** | Usar plan Pro/Max com OAuth (não API key). Monitorar `cost.total_cost_usd` na statusline. |
| Compacto automático apaga contexto crucial | **Médio** | Hook `Stop` grava estado antes. CLAUDE.md é imune a compacto. |
| Injeção de código via output do modelo | **Alto** | Nunca executar output do modelo como código sem revisão. Mas em modo autônomo, isso é implícito — mitigação: pre-approve só via hooks explícitos. |

### Recomendações de Segurança Consolidadas

✓ **Use `acceptEdits` (não `bypassPermissions`).** Auto-aprova edições no workdir, mas rejeita `rm -rf` e outras ops destrutivas.

✓ **Denylist obrigatória:**
```
Bash(rm -rf *)
Bash(git push --force *)
Bash(git push origin main *)
Bash(git push origin master *)
Bash(kubectl *)
Bash(npm publish *)
Bash(DROP TABLE *)
Bash(DROP DATABASE *)
Bash(terraform destroy *)
```

✓ **Hook PreToolUse em Bash** que valida e loga cada command antes de executar. Veja `check-usage-gate.sh`.

✓ **Sandbox: mantenha sessão em repo específico.** Não permita sair da workdir via `cd /`. Use hook `UserPromptSubmit` para validar cwd.

✓ **Relauncher externo monitorando.** Se quota esgotar, você quer saber. Logs em `/tmp/relauncher.log`.

✓ **Memória de longrun é source-of-truth.** Se ficar desincronizada do código, retomada diverge. Atualizar em cada checkpoint.

### Limitações Técnicas Honestas

- **% de uso é estimativa.** A Anthropic não expõe o limite exato em tokens; `used_percentage` é calculado contra budget interno. ± 5% de erro é normal.

- **O `%` é heurístico, não o número oficial.** O método padrão (contar tokens dos transcripts ÷ budget) depende de você calibrar o budget; trate o threshold como aproximação, não como leitura exata da cota. O endpoint OAuth (alternativa) é não-oficial — ver bullets abaixo.

- **[VERIFICAR] Formato de `~/.claude/.credentials.json`.** Campo do token OAuth pode ser `.oauth_token`, `.claudeAiOauth.accessToken`, ou outro. Não há documentação oficial — validar com `jq keys ~/.claude/.credentials.json`.

- **[VERIFICAR] Endpoint `/api/oauth/usage`.** Não-oficial, documentado por comunidade. Sem garantia de estabilidade. Validar que retorna `{five_hour: {utilization: N}}` ou `{five_hour: {used_percentage: N}}`.

- **Matcher de hook inadquado.** Se PreToolUse tem `matcher: "Bash"` apenas, tools `Edit`, `Write`, `Read` **não são bloqueadas** após 90% — continuam consumindo quota. Usar `matcher: "*"` é mais seguro mas pode ter implicações de performance.

- **Não há "snapshot" de estado de execução.** `--resume` retoma a conversa, mas se uma tool estava no meio de uma operação, ela re-executa (não continua).

- **Budget máximo para Opus 4.8:** ~2M de tokens em 5h (plano Max). Se tarefa gastar mais, vai precisar de múltiplos ciclos.

- **Reset exato:** a janela de 5h é "sliding window" — reset acontece 5h após o início da primeira requisição da sessão atual. Exato em ~±1min.

- **Custo é real.** Esse setup usa tokens de verdade do seu plano. Monitorar budget é essencial.

---

## Como Usar Este Kit

### Estrutura de Arquivos

```
~/.claude/
├── longrun-memory.md              ← crie ao iniciar
├── settings.json                  ← adicione bloco de hooks + permissions
└── hooks/long-run/
    ├── check-usage-gate.sh        ← copia de long-run/check-usage-gate.sh
    ├── inject-longrun-memory.sh   ← copia de long-run/inject-longrun-memory.sh
    └── relaunch-loop.sh           ← copia de long-run/relaunch-loop.sh
```

### Passo a Passo para Iniciar

1. **Leia e preencha** `long-run/auto-mode-checklist.md`.
2. **Crie** `~/.claude/longrun-memory.md` a partir de `long-run/longrun-memory.template.md`, preenchendo seu contexto.
3. **Copie scripts** de `long-run/*.sh` para `~/.claude/hooks/long-run/`.
4. **Mescle** o bloco de `long-run/settings.hooks.example.json` com seu `~/.claude/settings.json`.
5. **Teste os hooks** rodando um prompt curto com `--permission-mode acceptEdits`.
6. **Inicie a sessão:**
   ```bash
   SESSION_ID=$(claude -p "$(cat ~/.claude/longrun-memory.md)" \
     --permission-mode acceptEdits --output-format json | jq -r '.session_id')
   echo "$SESSION_ID" > ~/.claude/longrun_session_current
   ```
7. **Inicie o relauncher:**
   ```bash
   nohup ~/.claude/hooks/long-run/relaunch-loop.sh > /tmp/relauncher.log 2>&1 &
   ```

### Monitorar Durante Execução

Abra em terminal separado:
```bash
# Ver logs da sessão principal
tail -f ~/.claude/projects/*/transcripts/*.jsonl | jq '.message' | head -20

# Ver logs do relauncher
tail -f /tmp/relauncher.log

# Ver uso atual
~/.claude/long-run/watch-usage.sh --budget 500000
```

---

## Linkar com Docs Relacionadas

- **[06 — Memórias e Sessões Longas](06-memorias-e-sessoes-longas.md):** Como gerir contexto e sessões. A **memória de agente** deste doc é ortogonal à "memória de longrun" — use ambas.
- **[07 — Prompts Difíceis e Receitas](07-prompts-dificeis-e-receitas.md):** Padrões de prompting. Para o iniciar do long-run, use um prompt **curto e estruturado**, não um prompt gigante — deixe os detalhes na memória.
- **[02 — Catálogo de Agentes](02-catalogo-de-agentes.md):** Se o long-run envolve subagentes, cada um herda a config de permissão do pai. Verifique.

---

## Checklist Final: Pronto para 12h?

- [ ] Escopo é específico; critério de "pronto" é testável.
- [ ] Memória de longrun preenchida e em `~/.claude/longrun-memory.md`.
- [ ] Checklist de auto-mode respondido e salvo.
- [ ] Hooks copiados para `~/.claude/hooks/long-run/`.
- [ ] Settings.json mesclado com bloco de permissions + hooks.
- [ ] Denylist inclui `git push`, `rm -rf`, `npm publish`, `DROP`.
- [ ] Budget e threshold definidos (padrão: 500k tokens, 90%).
- [ ] Relauncher testado (rode uma sessão curta de 10min para validar).
- [ ] Você confortável com **12 horas sem intervenção**?

✓ **Sim em todos?** Pronto. Comece:

```bash
SESSION_ID=$(claude -p "$(cat ~/.claude/longrun-memory.md)" \
  --permission-mode acceptEdits --output-format json | jq -r '.session_id')
echo "$SESSION_ID" > ~/.claude/longrun_session_current
nohup ~/.claude/hooks/long-run/relaunch-loop.sh > /tmp/relauncher.log 2>&1 &
```

---

**Dúvidas?** Leia `long-run/README.md` para uma visão do toolkit. Cada script tem header de uso.
