#!/usr/bin/env bash
# TEMPLATE — revise/ajuste antes de usar
#
# watch-usage.sh — mede o uso da janela de 5h e (opcionalmente) escreve o
# arquivo de status canônico que o gate (check-usage-gate.sh) lê.
#
# MÉTODO PADRÃO (verificável, sem endpoint não-documentado):
#   soma os tokens (input+output+cache_creation; cache_read EXCLUÍDO por padrão pois é
#   barato e domina a conta — use INCLUDE_CACHE_READ=1 para incluí-lo) das entradas dos
#   transcripts (~/.claude/projects/**/*.jsonl) com timestamp nas últimas 5h, vs BUDGET.
#   O BUDGET é uma CALIBRAÇÃO sua — o limite real do plano não é exposto.
#   Logo, o "%" é uma HEURÍSTICA, não o número oficial. Ver doc 08, Parte B.
#
# Schema canônico escrito em STATUS_FILE (todos os leitores usam .used_percentage):
#   {"used_percentage":N,"tokens_used":N,"budget":N,"window_hours":5,"computed_at":"ISO"}
#
# Uso:
#   ./watch-usage.sh                          # imprime o status
#   ./watch-usage.sh --budget 8000000 --write # calcula e grava o STATUS_FILE
#   (em cron, a cada X min)  */10 * * * * BUDGET=8000000 /caminho/watch-usage.sh --write
#
# Requisitos: bash, jq, GNU date, bc.

set -euo pipefail

BUDGET=${BUDGET:-8000000}                       # tokens-equivalentes na janela de 5h (CALIBRE)
THRESHOLD=${THRESHOLD:-90}                       # % de alerta
WINDOW_HOURS=${WINDOW_HOURS:-5}
PROJECTS_DIR="${PROJECTS_DIR:-$HOME/.claude/projects}"
STATUS_FILE="${STATUS_FILE:-/tmp/claude_usage_current.json}"
WRITE=0
EXIT_ON_THRESHOLD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --budget) BUDGET="$2"; shift 2 ;;
    --threshold) THRESHOLD="$2"; shift 2 ;;
    --window-hours) WINDOW_HOURS="$2"; shift 2 ;;
    --status-file) STATUS_FILE="$2"; shift 2 ;;
    --write) WRITE=1; shift ;;
    --exit-on-threshold) EXIT_ON_THRESHOLD=1; shift ;;
    *) echo "uso: $0 [--budget N] [--threshold P] [--window-hours H] [--status-file PATH] [--write] [--exit-on-threshold]" >&2; exit 1 ;;
  esac
done

for bin in jq bc date; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERRO: '$bin' não encontrado no PATH." >&2; exit 1; }
done

# Epoch de corte = agora - WINDOW_HOURS (janela móvel; o reset real é definido pela Anthropic
# e não é exposto — isto é uma aproximação conservadora). Ver doc 08, Parte B.
CUTOFF=$(date -u -d "${WINDOW_HOURS} hours ago" +%s 2>/dev/null) \
  || { echo "ERRO: precisa de GNU date (date -d)." >&2; exit 1; }

# Soma input+output+cache_creation+cache_read das entradas com usage e timestamp >= corte,
# em TODOS os transcripts (a cota de 5h é por conta, não por sessão).
TOKENS_USED=0
if compgen -G "$PROJECTS_DIR"/**/*.jsonl >/dev/null 2>&1 || [[ -n "$(find "$PROJECTS_DIR" -name '*.jsonl' 2>/dev/null | head -1)" ]]; then
  TOKENS_USED=$(find "$PROJECTS_DIR" -name '*.jsonl' -print0 2>/dev/null \
    | xargs -0 cat 2>/dev/null \
    | jq -r --argjson cutoff "$CUTOFF" --argjson inccr "${INCLUDE_CACHE_READ:-0}" '
        select(.message.usage != null and .timestamp != null)
        | (.timestamp | sub("\\.[0-9]+Z$";"Z") | fromdateiso8601) as $ts
        | select($ts >= $cutoff)
        | (.message.usage
            | (.input_tokens//0)+(.output_tokens//0)+(.cache_creation_input_tokens//0)
              + (if $inccr == 1 then (.cache_read_input_tokens//0) else 0 end))
      ' 2>/dev/null \
    | awk '{s+=$1} END{printf "%d", s+0}')
fi
TOKENS_USED=${TOKENS_USED:-0}

# % = tokens_used / budget * 100 (limitado a 100). awk garante JSON válido (zero à esquerda em
# valores <1, ex.: 0.50 e não .50) e protege contra budget<=0.
USED_PCT=$(awk -v t="$TOKENS_USED" -v b="$BUDGET" 'BEGIN{ if(b+0<=0){print "0"; exit} p=t*100/b; if(p>100)p=100; printf "%.2f", p }')
USED_PCT=${USED_PCT:-0}
NOW_ISO=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

if [[ "$WRITE" == "1" ]]; then
  TMP=$(mktemp)
  jq -n --argjson pct "$USED_PCT" --argjson used "$TOKENS_USED" --argjson budget "$BUDGET" \
        --argjson wh "$WINDOW_HOURS" --arg now "$NOW_ISO" \
    '{used_percentage:$pct, tokens_used:$used, budget:$budget, window_hours:$wh, computed_at:$now}' \
    > "$TMP" && mv "$TMP" "$STATUS_FILE"
fi

echo "Janela de ${WINDOW_HOURS}h (heurística vs budget):"
echo "  Uso: ${USED_PCT}%  (${TOKENS_USED} / ${BUDGET} tokens-equiv)"
echo "  Threshold: ${THRESHOLD}%"
[[ "$WRITE" == "1" ]] && echo "  Status gravado em: $STATUS_FILE"

OVER=$(echo "$USED_PCT >= $THRESHOLD" | bc -l 2>/dev/null || echo 0)
if [[ "$OVER" == "1" ]]; then
  echo "  Status: THRESHOLD_EXCEEDED — pare os agentes e faça checkpoint."
  [[ "$EXIT_ON_THRESHOLD" == "1" ]] && exit 2
else
  echo "  Status: OK"
fi
exit 0
