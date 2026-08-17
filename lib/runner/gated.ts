import { isoNow } from '../card'
import type { FailureClass, StepMetric } from '../card'
import { maxReajuste, GATE_RETRIES } from './config'
import { patchCard } from './card-store'
import { runStep } from './agent'
import { runGatedReview, withGateRetry } from './codefox-gate'
import type { GateResult } from './codefox-gate'

export interface GatedDeps {
  runStep: typeof runStep
  runGatedReview: typeof runGatedReview
}

export interface GatedResult {
  metric: StepMetric
  ok: boolean
  text: string
  reason: string
  failureClass?: FailureClass
  failureReason?: string
  provider?: string
}

function review(id: string, wt: string, base: string, desc: string, label: string, revisar: typeof runGatedReview): Promise<GateResult> {
  return withGateRetry(
    () => revisar(wt, base, desc, id),
    reason => patchCard(id, {}, `${isoNow()} gate crivo [${label}]: NAO EXECUTOU (${reason}) — repetindo o gate sem reexecutar o agente`),
  )
}

export async function runGatedStep(id: string, wt: string, base: string, agent: string, instruction: string, desc: string, label: string, deps: GatedDeps = { runStep, runGatedReview }): Promise<GatedResult> {
  const t0 = Date.now()
  let cost = 0
  let costMeasured = true
  let tokens = 0
  let text = ''
  let reason = ''
  let attempt = 0
  const metric = (): StepMetric => ({ time: Math.round((Date.now() - t0) / 1000), cost, tokens, costMeasured })
  while (attempt <= maxReajuste()) {
    const suffix = attempt === 0 ? '' : `\n\nO revisor CRIVO reprovou a etapa anterior: ${reason}. Corrija exatamente isso, sem quebrar o resto.`
    const r = await deps.runStep(wt, agent, instruction + suffix, id)
    cost += r.cost
    costMeasured = costMeasured && r.costMeasured
    tokens += r.tokens
    text = r.text
    if (!r.ok) {
      if (r.failureClass && r.failureClass !== 'transient') {
        return { metric: metric(), ok: false, text, reason: `agente ${agent} falhou (${r.failureReason ?? 'erro'})`, failureClass: r.failureClass, failureReason: r.failureReason, provider: r.provider }
      }
      reason = `agente ${agent} falhou/timeout`
      patchCard(id, {}, `${isoNow()} step [${label}] ${agent}: FALHOU/timeout (tentativa ${attempt + 1})`)
      attempt++
      continue
    }
    const gate = await review(id, wt, base, `${desc} — etapa "${label}" (${agent})`, label, deps.runGatedReview)
    cost += gate.cost
    costMeasured = costMeasured && gate.costMeasured
    tokens += gate.tokens
    patchCard(id, {}, `${isoNow()} gate crivo [${label}]: ${gate.ok ? gate.verdict : 'NAO EXECUTOU'}${gate.reason ? ` — ${gate.reason}` : ''}`)
    if (!gate.ok) {
      return { metric: metric(), ok: false, text, reason: `crivo indisponivel apos ${GATE_RETRIES + 1} tentativa(s): ${gate.reason}`, failureClass: gate.failureClass, failureReason: gate.failureReason, provider: gate.provider }
    }
    if (gate.verdict !== 'BLOCKED') return { metric: metric(), ok: true, text, reason: '' }
    reason = gate.reason
    attempt++
  }
  return { metric: metric(), ok: false, text, reason }
}
