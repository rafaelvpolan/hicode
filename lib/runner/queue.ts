import { isoNow } from '../card'
import type { Job } from '../card'
import { MAX_CONCURRENCY } from './config'
import { patchCard } from './card-store'
import { reconcileStranded, pending, marcarEmVoo, liberar, quantosEmVoo } from './queue-state'
import { handleExecute } from './execute'
import { handleFinish } from './finish'
import { handleCorrect } from './correct'
import { handleSpec } from './spec-phase'
import { checkMerged } from './merge'
import { arquivar, precisaArquivar } from '../core/archive'
import { recordTickSuccess, reportTickFailure } from './health'
import { wakeDueWaiting } from './waiting'

export { reconcileStranded, pending } from './queue-state'


export async function runJob(job: Job): Promise<void> {
  marcarEmVoo(job.id)
  try {
    if (job.kind === 'execute') await handleExecute(job.id)
    else if (job.kind === 'finish') await handleFinish(job.id)
    else if (job.kind === 'spec') await handleSpec(job.id)
    else await handleCorrect(job.id)
  } catch (e) {
    patchCard(job.id, { status: 'HALTED' }, `${isoNow()} HALTED erro: ${String((e as Error)?.message ?? e)}`)
  } finally {
    liberar(job.id)
  }
}

function podar(): void {
  if (!precisaArquivar()) return
  const r = arquivar()
  for (const m of r.movidos) {
    process.stdout.write(`[runner] #${m.id}: arquivado (${m.status}) — teto de cards por projeto\n`)
  }
}

export function tick(): void {
  let ok = true
  const merged = checkMerged(Date.now()).catch(e => {
    reportTickFailure('checkMerged', e as Error)
    ok = false
  })
  const waking = wakeDueWaiting().catch(e => {
    reportTickFailure('wakeDueWaiting', e as Error)
    ok = false
  })
  try {
    podar()
  } catch (e) {
    reportTickFailure('podar', e as Error)
    ok = false
  }
  try {
    for (const job of pending()) {
      if (quantosEmVoo() >= MAX_CONCURRENCY) break
      void runJob(job)
    }
  } catch (e) {
    reportTickFailure('fila', e as Error)
    ok = false
  }
  void Promise.all([merged, waking]).then(() => { if (ok) recordTickSuccess() })
}
