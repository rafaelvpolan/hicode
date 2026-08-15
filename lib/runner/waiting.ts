import { isoAt, isoNow } from '../card'
import type { Fields } from '../card'
import { maxWaitingAttempts } from './config'
import { cardsByStatus, patchCard, patchCardWith } from './card-store'
import { probeProviderHealth } from '../ai/health-probe'
import { backoffMsFor } from './failure-policy'

function isDue(waitUntil: string): boolean {
  const t = Date.parse(waitUntil)
  return !Number.isFinite(t) || t <= Date.now()
}

async function wake(id: string, resumeStatus: string): Promise<void> {
  patchCard(id, {
    status: resumeStatus || 'EXECUTING',
    wait_reason: '',
    wait_until: '',
    wait_resume_status: '',
    wait_provider: '',
  }, `${isoNow()} WAITING->${resumeStatus || 'EXECUTING'} sonda de saude ok — retomando automaticamente`)
  process.stdout.write(`[runner] #${id}: WAITING->${resumeStatus || 'EXECUTING'} (retomado automaticamente)\n`)
}

interface RescheduleOutcome {
  halted: boolean
  attempts: number
  until: string
}

function rescheduleFields(outcome: RescheduleOutcome, fm: Fields, provider: string): Fields {
  outcome.attempts = (Number(fm.wait_attempts || '0') || 0) + 1
  if (outcome.attempts > maxWaitingAttempts()) {
    outcome.halted = true
    return {
      status: 'HALTED',
      halt_class: 'transient',
      halt_provider: provider,
      halt_reason: fm.wait_reason ?? '',
      halt_at: isoNow(),
      wait_attempts: '',
      wait_reason: '',
      wait_until: '',
      wait_resume_status: '',
      wait_provider: '',
    }
  }
  outcome.until = isoAt(Date.now() + backoffMsFor(outcome.attempts))
  return { wait_attempts: String(outcome.attempts), wait_until: outcome.until }
}

async function reschedule(id: string, provider: string): Promise<void> {
  const outcome: RescheduleOutcome = { halted: false, attempts: 0, until: '' }
  patchCardWith(
    id,
    (fm) => rescheduleFields(outcome, fm, provider),
    () => outcome.halted
      ? `${isoNow()} WAITING->HALTED esgotou ${maxWaitingAttempts()} tentativas — provedor ${provider || 'desconhecido'} segue indisponivel na sonda de saude`
      : `${isoNow()} WAITING: sonda de saude (${provider || 'desconhecido'}) ainda indisponivel — nova tentativa as ${outcome.until}`,
  )
  process.stdout.write(outcome.halted
    ? `[runner] #${id}: WAITING->HALTED (sonda de saude nunca voltou)\n`
    : `[runner] #${id}: WAITING segue esperando (tentativa ${outcome.attempts}/${maxWaitingAttempts()})\n`)
}

let acordando = false

export async function wakeDueWaiting(): Promise<void> {
  if (acordando) return
  acordando = true
  try {
    const due = cardsByStatus('WAITING').filter(c => isDue(c.wait_until ?? ''))
    for (const c of due) {
      const id = c.id ?? ''
      const provider = c.wait_provider ?? ''
      const healthy = await probeProviderHealth(provider)
      if (!healthy) {
        await reschedule(id, provider)
        continue
      }
      await wake(id, c.wait_resume_status ?? '')
    }
  } finally {
    acordando = false
  }
}
