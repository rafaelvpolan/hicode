import { isoNow } from '../card'
import type { Job } from '../card'
import { MAX_CONCURRENCY } from './config'
import { cardsByStatus, patchCard } from './card-store'
import { handleExecute } from './execute'
import { handleFinish } from './finish'
import { checkMerged } from './merge'

const active = new Set<string>()

export async function runJob(job: Job): Promise<void> {
  active.add(job.id)
  try {
    if (job.kind === 'execute') await handleExecute(job.id)
    else await handleFinish(job.id)
  } catch (e) {
    patchCard(job.id, { status: 'HALTED' }, `${isoNow()} HALTED erro: ${String((e as Error)?.message ?? e)}`)
  } finally {
    active.delete(job.id)
  }
}

export function pending(): Job[] {
  const ex: Job[] = cardsByStatus('EXECUTING').map(c => ({ kind: 'execute', id: c.id ?? '' }))
  const fi: Job[] = cardsByStatus('PREVIEW_OK').map(c => ({ kind: 'finish', id: c.id ?? '' }))
  return [...ex, ...fi].filter(j => !active.has(j.id))
}

export function tick(): void {
  void checkMerged(Date.now())
  for (const job of pending()) {
    if (active.size >= MAX_CONCURRENCY) break
    void runJob(job)
  }
}
