#!/usr/bin/env bash
# Controla o daemon do motor hicode (bun runner.ts) via PID-file.
# Substitui o `pkill -f "runner.ts"`, que casava com o proprio shell que rodava o comando
# (auto-kill, exit 144). Aqui mata-se por PID exato; tanto o PID-file quanto o fallback so
# aceitam um pid que PROVE ser o motor deste clone (cmdline EXATO + cwd == ROOT), nunca por
# substring e nunca por "esta vivo" — pid vivo num pidfile obsoleto e pid reciclado.
# Onde nao ha /proc (macOS), a prova forte e impossivel: o PID-file degrada para `kill -0` (o que
# ja funcionava antes da prova forte existir) e a varredura de fallback nao adota ninguem — sem
# /proc nao da para distinguir o motor de outro `bun`, e matar estranho e pior do que nao achar.
# Uso: scripts/runner-daemon.sh {start|stop|restart|status}
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDFILE="${HICODE_RUNNER_PIDFILE:-$ROOT/.runner.pid}"
LOG="${HICODE_RUNNER_LOG:-$ROOT/.runner.log}"
LOCKFILE="${HICODE_RUNNER_LOCK:-$ROOT/.runner.lock}"
ARRANQUE_ESPERAS=60
ARRANQUE_INTERVALO=0.05

caminho_real() {
  readlink -f "$1" 2>/dev/null || echo "$1"
}

proc_legivel() {
  [ -r "/proc/$$/cmdline" ]
}

# Prova de identidade: o pid tem de ser o motor DESTE clone (cwd == ROOT e cmdline exato).
# Vale para o fallback e para o PID-file: pid vivo nao e prova, o kernel recicla pid.
e_o_motor() {
  local pid="$1" cmd
  [ -n "$pid" ] || return 1
  proc_legivel || return 1
  [ "$(caminho_real "/proc/$pid/cwd")" = "$(caminho_real "$ROOT")" ] || return 1
  cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  case "$cmd" in
    "bun runner.ts "|"bun runner.ts") return 0 ;;
    *) return 1 ;;
  esac
}

find_daemon() {
  local pid
  for pid in $(pgrep -x bun 2>/dev/null || true); do
    if e_o_motor "$pid"; then echo "$pid"; return 0; fi
  done
  return 1
}

dono_do_pidfile() {
  local pid
  [ -f "$PIDFILE" ] || return 1
  pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  if proc_legivel && ! e_o_motor "$pid"; then return 1; fi
  echo "$pid"
}

marca_dono() {
  echo "$1" > "$PIDFILE"
}

solta_pidfile() {
  if [ "$(cat "$PIDFILE" 2>/dev/null || true)" = "$1" ]; then rm -f "$PIDFILE"; fi
}

running_pid() {
  dono_do_pidfile || find_daemon
}

arrancou() {
  local pid="$1" espera=0
  while [ "$espera" -lt "$ARRANQUE_ESPERAS" ]; do
    if ! kill -0 "$pid" 2>/dev/null; then return 1; fi
    if [ "$(cat "$LOCKFILE" 2>/dev/null || true)" = "$pid" ]; then return 0; fi
    sleep "$ARRANQUE_INTERVALO"
    espera=$((espera + 1))
  done
  kill -0 "$pid" 2>/dev/null
}

start() {
  local pid
  if pid="$(running_pid)"; then marca_dono "$pid"; echo "runner ja online (PID $pid)"; return 0; fi
  cd "$ROOT"
  nohup bun runner.ts >>"$LOG" 2>&1 &
  pid=$!
  if ! arrancou "$pid"; then
    echo "runner NAO subiu: o processo $pid morreu no arranque - motivo em $LOG" >&2
    if [ -f "$LOG" ]; then tail -n 3 "$LOG" >&2; fi
    return 1
  fi
  marca_dono "$pid"
  echo "runner iniciado (PID $pid) - log: $LOG"
}

stop() {
  local pid anotado
  anotado="$(cat "$PIDFILE" 2>/dev/null || true)"
  if ! pid="$(running_pid)"; then echo "runner ja offline"; solta_pidfile "$anotado"; return 0; fi
  kill "$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  if kill -0 "$pid" 2>/dev/null; then kill -9 "$pid" 2>/dev/null || true; fi
  solta_pidfile "$pid"
  echo "runner parado (PID $pid)"
}

status() {
  local pid
  if pid="$(running_pid)"; then echo "online (PID $pid) - log: $LOG"; else echo "offline"; fi
}

case "${1:-}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; start ;;
  status)  status ;;
  *) echo "uso: $0 {start|stop|restart|status}" >&2; exit 2 ;;
esac
