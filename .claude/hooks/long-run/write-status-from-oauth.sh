#!/bin/bash
# TEMPLATE — revise/ajuste antes de usar
#
# write-status-from-oauth.sh — Escreve /tmp/claude_usage_current.json via endpoint OAuth
#
# PROPÓSITO CRÍTICO:
# O hook PreToolUse (check-usage-gate.sh) depende de /tmp/claude_usage_current.json
# existir e ter o status da janela de 5h. Este script DEVE rodar em SessionStart
# para garantir que o arquivo sempre tenha o valor mais recente.
#
# SEM ESTE SCRIPT, o gate de 90% NÃO FUNCIONA (arquivo não existe → used_percentage=0 → gate passa)
#
# Registrar em settings.json como hook SessionStart:
# {
#   "hooks": {
#     "SessionStart": [
#       {
#         "matcher": "*",
#         "hooks": [
#           {
#             "type": "command",
#             "command": "~/.claude/hooks/long-run/write-status-from-oauth.sh",
#             "timeout": 5
#           }
#         ]
#       }
#     ]
#   }
# }

set -euo pipefail

# ============================================================================
# CONFIGURAÇÃO
# ============================================================================

CREDENTIALS="${CREDENTIALS:-$HOME/.claude/.credentials.json}"
OUTPUT_FILE="${OUTPUT_FILE:-/tmp/claude_usage_current.json}"
LOG_FILE="${LOG_FILE:-/tmp/write-status-from-oauth.log}"

# ============================================================================
# FUNÇÕES
# ============================================================================

log_event() {
  local msg="$1"
  echo "[$(date -u +'%Y-%m-%d %H:%M:%S UTC')] $msg" >> "$LOG_FILE"
}

# ============================================================================
# MAIN
# ============================================================================

log_event "write-status-from-oauth.sh iniciado"

# [VERIFICAR] Formato exato do token em ~/.claude/.credentials.json
# Campo pode ser .oauth_token, .claudeAiOauth.accessToken, ou outro
# Executar: jq 'keys' ~/.claude/.credentials.json para descobrir

TOKEN=$(jq -r '.oauth_token // .claudeAiOauth.accessToken // ""' "$CREDENTIALS" 2>/dev/null || echo "")

if [[ -z "$TOKEN" ]]; then
  log_event "ERRO: Token OAuth não encontrado em $CREDENTIALS"
  log_event "Dica: Executar 'jq keys $CREDENTIALS' para listar campos disponíveis"
  # Não sair com erro — deixar o gate usar 0% (comportamento seguro)
  exit 0
fi

# Chamar endpoint OAuth
# [VERIFICAR] Endpoint exato: https://api.anthropic.com/api/oauth/usage
# Campos esperados: {five_hour: {utilization: N}} ou {five_hour: {used_percentage: N}}

log_event "Chamando endpoint OAuth para atualizar status..."

RESPONSE=$(curl -s \
  -H "Authorization: Bearer $TOKEN" \
  -H "User-Agent: claude-code/2.1.187" \
  "https://api.anthropic.com/api/oauth/usage" 2>&1 || echo "{}")

if [[ -z "$RESPONSE" || "$RESPONSE" == "{}" ]]; then
  log_event "AVISO: Endpoint OAuth retornou resposta vazia ou erro"
  exit 0
fi

# Validar que é JSON válido
if ! echo "$RESPONSE" | jq . > /dev/null 2>&1; then
  log_event "AVISO: Endpoint retornou JSON inválido: $RESPONSE"
  exit 0
fi

# NORMALIZAR para o schema canônico que os leitores (check-usage-gate.sh / watch-usage.sh) usam:
#   {"used_percentage":N, ...}
# A resposta OAuth crua é guardada em .raw para debug. [VERIFICAR] o caminho do % na resposta
# real do endpoint nesta sua conta antes de confiar (pode ser .five_hour.utilization ou outro).
UTIL=$(echo "$RESPONSE" | jq -r '.five_hour.utilization // .five_hour.used_percentage // empty' 2>/dev/null || echo "")
if [[ -z "$UTIL" ]]; then
  log_event "AVISO: não achei o % na resposta OAuth (verifique o schema). Não sobrescrevendo $OUTPUT_FILE."
  exit 0
fi

TMP=$(mktemp)
echo "$RESPONSE" | jq --argjson pct "$UTIL" \
  '{used_percentage:$pct, source:"oauth", computed_at:(now|todateiso8601), raw:.}' \
  > "$TMP" 2>/dev/null && mv "$TMP" "$OUTPUT_FILE"

log_event "Status atualizado (canônico): used_percentage=$UTIL%"
exit 0
