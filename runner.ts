import { MAX_CONCURRENCY, POLL_MS, RUN_TIMEOUT_MS } from './lib/runner/config'
import { pending, runJob, tick } from './lib/runner/queue'

if (process.argv.includes('--once')) {
  void Promise.all(pending().slice(0, MAX_CONCURRENCY).map(runJob)).then(() => process.exit(0))
} else {
  process.stdout.write(`hicode runner ativo — worktrees + paralelo (max ${MAX_CONCURRENCY}, poll ${POLL_MS}ms, timeout ${RUN_TIMEOUT_MS}ms)\n`)
  setInterval(tick, POLL_MS)
  tick()
}
