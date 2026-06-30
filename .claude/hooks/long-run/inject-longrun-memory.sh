#!/bin/bash
# TEMPLATE — revise/ajuste antes de usar
#
# inject-longrun-memory.sh — Hook SessionStart que injeta contexto da memória de longrun
#
# Registrar em settings.json:
# {
#   "hooks": {
#     "SessionStart": [{
#       "matcher": "*",
#       "hooks": [{
#         "type": "command",
#         "command": "~/.claude/hooks/long-run/inject-longrun-memory.sh"
#       }]
#     }]
#   }
# }
#
# Quando: no início ou retomada de sessão
# O que faz: lê ~/.claude/longrun-memory.md e injeta em contexto via hookSpecificOutput.additionalContext

set -euo pipefail

# ============================================================================
# CONFIGURAÇÃO
# ============================================================================

LONGRUN_MEMORY="${LONGRUN_MEMORY:-$HOME/.claude/longrun-memory.md}"
LOG_FILE="${LOG_FILE:-/tmp/inject-longrun-memory.log}"

# ============================================================================
# MAIN
# ============================================================================

log_event() {
  local msg="$1"
  echo "[$(date -u +'%Y-%m-%d %H:%M:%S UTC')] $msg" >> "$LOG_FILE"
}

log_event "SessionStart hook: injecting longrun memory"

if [[ ! -f "$LONGRUN_MEMORY" ]]; then
  log_event "WARNING: $LONGRUN_MEMORY não encontrado. Continuando sem contexto adicional."
  exit 0
fi

# Ler conteúdo do arquivo
MEMORY_CONTENT=$(cat "$LONGRUN_MEMORY" 2>/dev/null || echo "")

if [[ -z "$MEMORY_CONTENT" ]]; then
  log_event "WARNING: $LONGRUN_MEMORY está vazio"
  exit 0
fi

log_event "Injecting $(wc -c < "$LONGRUN_MEMORY") bytes of context"

# Escapar newlines para JSON
MEMORY_ESCAPED=$(echo "$MEMORY_CONTENT" | jq -R -s '.')

# Retornar JSON com contexto adicional
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": $MEMORY_ESCAPED
  }
}
EOF

exit 0
