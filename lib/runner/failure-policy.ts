import { isoAt, isoNow } from '../card'
import type { Fields, FailureClass } from '../card'
import { maxWaitingAttempts } from './config'
import { patchCard, readCard } from './card-store'
import { appendFailureAttempt } from './attempts'
import type { FailureOutcome } from './attempts'
import { stampRunFailure } from './runs'

export type ResumeStatus = 'EXECUTING' | 'PREVIEW_OK' | 'CORRECTING' | 'SPECCED'

export type PolicyOutcome = FailureOutcome

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

function recordFailure(input: FailurePolicyInput, attempt: number, outcome: PolicyOutcome): void {
  stampRunFailure(input.id, { failureClass: input.failureClass, failureReason: input.failureReason }, input.provider)
  appendFailureAttempt(input.id, {
    attempt,
    fromStatus: input.fromStatus,
    provider: input.provider,
    failureClass: input.failureClass,
    failureReason: input.failureReason,
    outcome,
  })
}

export function applyFailurePolicy(input: FailurePolicyInput): PolicyOutcome {
  const attempt = attemptNumber(input.id)
  const outcome = decideOutcome(input, attempt)
  recordFailure(input, attempt, outcome)
  return outcome
}

function attemptNumber(id: string): number {
  const card = readCard(id)
  return (Number(card?.fm.wait_attempts || '0') || 0) + 1
}

function decideOutcome(input: FailurePolicyInput, attempts: number): PolicyOutcome {
  if (input.failureClass === 'quota') {
    patchCard(input.id, haltFields(input), `${isoNow()} ${input.fromStatus}->HALTED cota do provedor ${input.provider || 'desconhecido'} esgotada: ${input.failureReason} — motor PARADO (sem troca automatica de provedor); configure HICODE_QUOTA_FALLBACK para permitir troca explicita`)
    return 'halt'
  }

  if (input.failureClass === 'terminal') {
    patchCard(input.id, haltFields(input), `${isoNow()} ${input.fromStatus}->HALTED ${input.failureReason} — ${input.technicalDetail}`)
    return 'halt'
  }

  if (attempts > maxWaitingAttempts()) {
    patchCard(input.id, haltFields(input), `${isoNow()} ${input.fromStatus}->HALTED esgotou ${maxWaitingAttempts()} tentativas de espera (${input.failureReason}) — ultimo erro: ${input.technicalDetail}`)
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
  patchCard(input.id, fields, `${isoNow()} ${input.fromStatus}->WAITING (tentativa ${attempts}/${maxWaitingAttempts()}) ${input.failureReason} — proxima tentativa as ${until}`)
  return 'waiting'
}
