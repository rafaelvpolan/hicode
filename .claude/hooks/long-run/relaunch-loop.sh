#!/bin/bash
# TEMPLATE — revise/ajuste antes de usar
#
# relaunch-loop.sh — Loop externo que detecta reset de quota e relança sessão
#
# Uso: nohup ~/.claude/hooks/long-run/relaunch-loop.sh > /tmp/relauncher.log 2>&1 &
#
# Workflow:
# 1. Lê SESSION_ID de ~/.claude/longrun_session_current
# 2. A cada 5 min, chama endpoint OAuth para checar utilization
# 3. Quando utilization < 5% (quota zerada e resetada), aguarda ~30min extra
# 4. Relança: claude --resume $SESSION_ID + contexto da memória de longrun
# 5. Atualiza SESSION_ID se nova
# 6. Repete

set -euo pipefail

# ============================================================================
# CONFIGURAÇÃO
# ============================================================================

SESSION_CURRENT="${SESSION_CURRENT:-$HOME/.claude/longrun_session_current}"
LONGRUN_MEMORY="${LONGRUN_MEMORY:-$HOME/.claude/longrun-memory.md}"
CREDENTIALS="${CREDENTIALS:-$HOME/.claude/.credentials.json}"
LOG_FILE="${LOG_FILE:-/tmp/relauncher.log}"
CHECK_INTERVAL=${CHECK_INTERVAL:-300}           # segundos entre checks (300 = 5min)
RESET_WAIT_EXTRA=${RESET_WAIT_EXTRA:-1800}      # segundos extra de espera após reset (1800 = 30min)
UTIL_THRESHOLD=${UTIL_THRESHOLD:-5}             # se utilization < 5%, quota zerou

# ============================================================================
# FUNÇÕES
# ============================================================================

log_event() {
  local level="$1"
  local msg="$2"
  echo "[$(date -u +'%Y-%m-%d %H:%M:%S UTC')] [$level] $msg" | tee -a "$LOG_FILE"
}

get_session_id() {
  if [[ -f "$SESSION_CURRENT" ]]; then
    cat "$SESSION_CURRENT" 2>/dev/null || echo ""
  else
    echo ""
  fi
}

save_session_id() {
  local id="$1"
  echo "$id" > "$SESSION_CURRENT"
}

check_utilization() {
  # [VERIFICAR] Formato exato do token em ~/.claude/.credentials.json
  # Campo pode ser .oauth_token, .claudeAiOauth.accessToken, ou outro
  # Executar: jq 'keys' ~/.claude/.credentials.json para descobrir

  local token
  token=$(jq -r '.oauth_token // .claudeAiOauth.accessToken // ""' "$CREDENTIALS" 2>/dev/null || echo "")

  if [[ -z "$token" ]]; then
    log_event "ERROR" "OAuth token não encontrado em $CREDENTIALS. Verificar formato com: jq 'keys' $CREDENTIALS"
    return 1
  fi

  # Chamar endpoint OAuth
  # [VERIFICAR] Endpoint e formato de resposta
  # Documentação oficial: https://code.claude.com/docs/en/headless (não oficial este endpoint)
  local response
  response=$(curl -s \
    -H "Authorization: Bearer $token" \
    -H "User-Agent: claude-code/2.1.187" \
    "https://api.anthropic.com/api/oauth/usage" 2>&1 || echo "{}")

  if [[ -z "$response" || "$response" == "{}" ]]; then
    log_event "WARN" "Falha ao chamar endpoint OAuth ou resposta vazia"
    return 1
  fi

  # Extrair utilization
  # [VERIFICAR] Campos podem ser: .five_hour.utilization, .five_hour.used_percentage, etc
  local util
  util=$(echo "$response" | jq -r '.five_hour.utilization // .five_hour.used_percentage // .utilization // -1' 2>/dev/null || echo "-1")

  echo "$util"
}

# ============================================================================
# MAIN
# ============================================================================

log_event "INFO" "Relauncher iniciado"
log_event "INFO" "Session current file: $SESSION_CURRENT"
log_event "INFO" "Longrun memory: $LONGRUN_MEMORY"
log_event "INFO" "Check interval: $CHECK_INTERVAL seconds"

# Validar que arquivo de sessão existe
if [[ ! -f "$SESSION_CURRENT" ]]; then
  log_event "ERROR" "Arquivo de sessão não encontrado: $SESSION_CURRENT. Aborting."
  exit 1
fi

if [[ ! -f "$LONGRUN_MEMORY" ]]; then
  log_event "ERROR" "Memória de longrun não encontrada: $LONGRUN_MEMORY. Aborting."
  exit 1
fi

# Loop principal
while true; do
  SESSION_ID=$(get_session_id)

  if [[ -z "$SESSION_ID" ]]; then
    log_event "ERROR" "SESSION_ID vazio. Aborting."
    exit 1
  fi

  log_event "INFO" "Monitorando sessão: $SESSION_ID"

  # Checar utilization
  UTIL=$(check_utilization)

  if [[ "$UTIL" == "-1" ]]; then
    log_event "WARN" "Falha ao obter utilization. Tentando novamente em $CHECK_INTERVAL segundos."
  elif (( $(echo "$UTIL < $UTIL_THRESHOLD" | bc -l 2>/dev/null || echo "0") )); then
    log_event "INFO" "Quota zerada detectada (utilization: $UTIL%). Aguardando $RESET_WAIT_EXTRA segundos para garantir reset..."
    sleep "$RESET_WAIT_EXTRA"

    log_event "INFO" "Tentando relançar sessão $SESSION_ID..."

    # Ler memória de longrun
    if [[ ! -f "$LONGRUN_MEMORY" ]]; then
      log_event "ERROR" "Arquivo de memória não encontrado: $LONGRUN_MEMORY"
      sleep "$CHECK_INTERVAL"
      continue
    fi

    PROMPT="$(cat "$LONGRUN_MEMORY")"$'\n'"Retomar tarefa conforme checkpoint acima. Última parada em 90% de quota."

    # Relançar sessão
    # [IMPORTANTE] --resume requer que a sessão NÃO tenha expirado (máx 7 dias)
    # Se expirada, claude -p cria nova sessão (que perderá contexto do --resume)
    OUTPUT=$(claude -p "$PROMPT" \
      --resume "$SESSION_ID" \
      --permission-mode acceptEdits \
      --output-format json 2>&1 || echo "{}")

    log_event "INFO" "Claude relançado. Processando output..."

    # Gravar output completo para debug
    echo "$OUTPUT" >> "$LOG_FILE"

    # Tentar extrair novo SESSION_ID
    NEW_SESSION=$(echo "$OUTPUT" | jq -r '.session_id // ""' 2>/dev/null || echo "")

    if [[ -n "$NEW_SESSION" && "$NEW_SESSION" != "$SESSION_ID" ]]; then
      log_event "WARN" "Novo session_id (possível expiração de --resume): $NEW_SESSION"
      save_session_id "$NEW_SESSION"
      SESSION_ID="$NEW_SESSION"
    fi

    log_event "INFO" "Relançamento concluído. Continuando monitoramento..."

  else
    log_event "DEBUG" "Quota OK (utilization: $UTIL%). Continuar em $CHECK_INTERVAL segundos."
  fi

  # Dormir até próximo check
  sleep "$CHECK_INTERVAL"
done

exit 0
