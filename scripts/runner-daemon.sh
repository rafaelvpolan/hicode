#!/usr/bin/env bash
# Controla o daemon do motor hicode (bun runner.ts) via PID-file.
# Substitui o `pkill -f "runner.ts"`, que casava com o proprio shell que rodava o comando
# (auto-kill, exit 144). Aqui mata-se por PID exato; o fallback localiza o processo pelo
# cmdline EXATO, nunca por substring.
# Uso: scripts/runner-daemon.sh {start|stop|restart|status}
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDFILE="${HICODE_RUNNER_PIDFILE:-$ROOT/.runner.pid}"
LOG="${HICODE_RUNNER_LOG:-$ROOT/.runner.log}"

find_daemon() {
  local pid cmd
  for pid in $(pgrep -x bun 2>/dev/null || true); do
    cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    case "$cmd" in
      "bun runner.ts "*|"bun runner.ts") echo "$pid"; return 0 ;;
    esac
  done
  return 1
}

running_pid() {
  local pid
  if [ -f "$PIDFILE" ]; then
    pid="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo "$pid"; return 0; fi
  fi
  find_daemon
}

start() {
  local pid
  if pid="$(running_pid)"; then echo "runner ja online (PID $pid)"; return 0; fi
  cd "$ROOT"
  nohup bun runner.ts >>"$LOG" 2>&1 &
  pid=$!
  echo "$pid" > "$PIDFILE"
  echo "runner iniciado (PID $pid) - log: $LOG"
}

stop() {
  local pid
  if ! pid="$(running_pid)"; then echo "runner ja offline"; rm -f "$PIDFILE"; return 0; fi
  kill "$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  if kill -0 "$pid" 2>/dev/null; then kill -9 "$pid" 2>/dev/null || true; fi
  rm -f "$PIDFILE"
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
