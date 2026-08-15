import { isoAt, isoNow } from '../card'
import type { Fields, FailureClass } from '../card'
import { MAX_WAITING_ATTEMPTS } from './config'
import { patchCard, readCard } from './card-store'

export type ResumeStatus = 'EXECUTING' | 'PREVIEW_OK' | 'CORRECTING' | 'SPECCED'

export type PolicyOutcome = 'waiting' | 'halt'

export interface FailurePolicyInput {
  id: string
  fromStatus: string
  resumeStatus: ResumeStatus
  provider: string
  failureClass: FailureClass
  failureReason: string
  technicalDetail: string
  resumeStep?: string
  extraFields?: Fields
}

const BACKOFF_STEPS_MS = [30_000, 60_000, 120_000, 300_000, 600_000]

export function backoffMsFor(attempt: number): number {
  const idx = Math.min(Math.max(attempt, 1), BACKOFF_STEPS_MS.length) - 1
  return BACKOFF_STEPS_MS[idx] ?? 600_000
}

function haltFields(input: FailurePolicyInput): Fields {
  return {
    status: 'HALTED',
    halt_class: input.failureClass,
    halt_provider: input.provider,
    halt_reason: input.failureReason,
    halt_at: isoNow(),
    wait_attempts: '',
    wait_reason: '',
    wait_until: '',
    wait_resume_status: '',
    wait_provider: '',
    ...input.extraFields,
  }
}

export function applyFailurePolicy(input: FailurePolicyInput): PolicyOutcome {
  const card = readCard(input.id)
  const previousAttempts = Number(card?.fm.wait_attempts || '0') || 0

  if (input.failureClass === 'quota') {
    patchCard(input.id, haltFields(input), `${isoNow()} ${input.fromStatus}->HALTED cota do provedor ${input.provider || 'desconhecido'} esgotada: ${input.failureReason} — motor PARADO (sem troca automatica de provedor); configure HICODE_QUOTA_FALLBACK para permitir troca explicita`)
    return 'halt'
  }

  if (input.failureClass === 'terminal') {
    patchCard(input.id, haltFields(input), `${isoNow()} ${input.fromStatus}->HALTED ${input.failureReason} — ${input.technicalDetail}`)
    return 'halt'
  }

  const attempts = previousAttempts + 1
  if (attempts > MAX_WAITING_ATTEMPTS) {
    patchCard(input.id, haltFields(input), `${isoNow()} ${input.fromStatus}->HALTED esgotou ${MAX_WAITING_ATTEMPTS} tentativas de espera (${input.failureReason}) — ultimo erro: ${input.technicalDetail}`)
    return 'halt'
  }
  const until = isoAt(Date.now() + backoffMsFor(attempts))
  const fields: Fields = {
    status: 'WAITING',
    wait_reason: input.failureReason,
    wait_attempts: String(attempts),
    wait_until: until,
    wait_resume_status: input.resumeStatus,
    wait_provider: input.provider,
    ...(input.resumeStep ? { resume_from: input.resumeStep } : {}),
    ...input.extraFields,
  }
  patchCard(input.id, fields, `${isoNow()} ${input.fromStatus}->WAITING (tentativa ${attempts}/${MAX_WAITING_ATTEMPTS}) ${input.failureReason} — proxima tentativa as ${until}`)
  return 'waiting'
}
