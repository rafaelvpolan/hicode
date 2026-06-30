#!/usr/bin/env bash
# TEMPLATE — revise/ajuste antes de usar
#
# check-usage-gate.sh — Hook PreToolUse que NEGA tools quando o uso da janela de 5h >= THRESHOLD.
#
# COMO O CLAUDE CODE ENTREGA O PAYLOAD: via STDIN (JSON), NÃO numa variável de ambiente.
# Por isso lemos `HOOK_INPUT=$(cat)`. (Bug histórico: ler $HOOK_INPUT sob `set -u` aborta o
# script antes da checagem → o gate "falha aberto" e a tool passa.)
#
# FONTE DO %: o arquivo STATUS_FILE, que precisa ser mantido FRESCO por um processo externo
# (cron rodando watch-usage.sh --write a cada X min). SessionStart só dá o valor inicial.
# Se o arquivo estiver ausente/velho, o gate assume 0% (falha aberto) — ver AVISO no doc 08.
#
# Registrar em settings.json (PreToolUse). Ver settings.hooks.example.json.

set -euo pipefail

THRESHOLD=${THRESHOLD:-90}
STATUS_FILE="${STATUS_FILE:-/tmp/claude_usage_current.json}"
LONGRUN_MEMORY="${LONGRUN_MEMORY:-$HOME/.claude/longrun-memory.md}"
LOG_FILE="${LOG_FILE:-/tmp/check-usage-gate.log}"

# Lê o payload do hook via STDIN. `|| true` e o default evitam que `set -u`/pipefail derrubem
# o script caso não haja stdin (ex.: execução manual de teste).
HOOK_INPUT="$(cat 2>/dev/null || true)"
HOOK_INPUT="${HOOK_INPUT:-{}}"

log_event() {            # aceita N argumentos (junta tudo) — evita descartar a 2ª palavra
  echo "[$(date -u +'%Y-%m-%d %H:%M:%S UTC')] $*" >> "$LOG_FILE" 2>/dev/null || true
}

get_used_percentage() {
  if [[ -f "$STATUS_FILE" ]]; then
    jq -r '.used_percentage // .five_hour.utilization // .utilization // 0' "$STATUS_FILE" 2>/dev/null || echo 0
  else
    echo 0
  fi
}

emit_deny() {            # imprime o JSON de deny no formato hookSpecificOutput
  local reason="$1"
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "$reason"
  }
}
EOF
}

# Identifica a tool (apenas para log; o gate é por uso, não por tool).
TOOL_TYPE=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo unknown)
CMD=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // .tool_input.file_path // .tool_input.path // "unknown"' 2>/dev/null || echo unknown)

USED_PCT=$(get_used_percentage)
USED_PCT=${USED_PCT:-0}

if [[ "$USED_PCT" == "0" ]] || [[ ! -f "$STATUS_FILE" ]]; then
  log_event "WARN status ausente/0 ($STATUS_FILE) — assumindo 0% (FALHA ABERTO: sem proteção). tool=$TOOL_TYPE"
fi

OVER=$(echo "$USED_PCT >= $THRESHOLD" | bc -l 2>/dev/null || echo 0)
if [[ "$OVER" == "1" ]]; then
  log_event "DENIED tool=$TOOL_TYPE cmd=$CMD used=${USED_PCT}% threshold=${THRESHOLD}%"
  emit_deny "Quota de 5h em ${USED_PCT}% (>= ${THRESHOLD}%). Parada automática do long-run. Aguardando reset."
  if [[ -f "$LONGRUN_MEMORY" ]]; then
    {
      echo ""
      echo "## ⏸️ Parada automática (gate de ${THRESHOLD}%)"
      echo "- Timestamp: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
      echo "- Uso: ${USED_PCT}%"
      echo "- Tool bloqueada: ${TOOL_TYPE} (${CMD})"
      echo "- Próxima ação: relauncher externo detecta o reset e retoma desta memória."
    } >> "$LONGRUN_MEMORY" 2>/dev/null || true
  fi
  exit 0
fi

log_event "ALLOWED tool=$TOOL_TYPE used=${USED_PCT}% threshold=${THRESHOLD}%"
exit 0
