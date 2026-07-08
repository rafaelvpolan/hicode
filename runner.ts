import { MAX_CONCURRENCY, POLL_MS, RUN_TIMEOUT_MS } from './lib/runner/config'
import { pending, reconcileStranded, runJob, tick } from './lib/runner/queue'
import { renderProgress } from './lib/runner/progress'
import { initHicodeHome } from './lib/runner/hicode-home'
import { runSync } from './lib/tasks/sync'
import { taskSyncName } from './lib/tasks/registry'

if (process.argv.includes('--init')) {
  const target = process.argv[process.argv.indexOf('--init') + 1] ?? process.cwd()
  const created = initHicodeHome(target)
  process.stdout.write(created.length ? `.hicode/ provisionado em ${target}:\n${created.map(c => `  + ${c}`).join('\n')}\n` : `.hicode/ ja existe em ${target}\n`)
  process.exit(0)
} else if (process.argv.includes('--sync')) {
  void runSync().then((r) => {
    process.stdout.write(`sync (${taskSyncName()}): ${r.created} cards criados, ${r.pushed} espelhados de ${r.pulled} externos\n`)
    process.exit(0)
  })
} else if (process.argv.includes('--status')) {
  const draw = (): void => { process.stdout.write(`\x1b[2J\x1b[H${renderProgress()}\n`) }
  draw()
  if (process.argv.includes('--watch')) setInterval(draw, 2000)
  else process.exit(0)
} else {
  reconcileStranded()
  if (process.argv.includes('--once')) {
    void Promise.all(pending().slice(0, MAX_CONCURRENCY).map(runJob)).then(() => process.exit(0))
  } else {
    process.stdout.write(`hicode runner ativo — worktrees + paralelo (max ${MAX_CONCURRENCY}, poll ${POLL_MS}ms, timeout ${RUN_TIMEOUT_MS}ms)\n`)
    setInterval(tick, POLL_MS)
    tick()
  }
}
