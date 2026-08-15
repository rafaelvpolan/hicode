import { isoNow } from '../card'
import type { StepMetric } from '../card'
import { MAX_REAJUSTE, GATE_RETRIES } from './config'
import { patchCard } from './card-store'
import { runStep } from './agent'
import { runGatedReview, withGateRetry } from './codefox-gate'
import type { GateResult } from './codefox-gate'

export interface GatedResult {
  metric: StepMetric
  ok: boolean
  text: string
  reason: string
}

function review(id: string, wt: string, base: string, desc: string, label: string): Promise<GateResult> {
  return withGateRetry(
    () => runGatedReview(wt, base, desc),
    reason => patchCard(id, {}, `${isoNow()} gate crivo [${label}]: NAO EXECUTOU (${reason}) — repetindo o gate sem reexecutar o agente`),
  )
}

export async function runGatedStep(id: string, wt: string, base: string, agent: string, instruction: string, desc: string, label: string): Promise<GatedResult> {
  const t0 = Date.now()
  let cost = 0
  let tokens = 0
  let text = ''
  let reason = ''
  let attempt = 0
  while (attempt <= MAX_REAJUSTE) {
    const suffix = attempt === 0 ? '' : `\n\nO revisor CRIVO reprovou a etapa anterior: ${reason}. Corrija exatamente isso, sem quebrar o resto.`
    const r = await runStep(wt, agent, instruction + suffix, id)
    cost += r.cost
    tokens += r.tokens
    text = r.text
    if (!r.ok) {
      reason = `agente ${agent} falhou/timeout`
      patchCard(id, {}, `${isoNow()} step [${label}] ${agent}: FALHOU/timeout (tentativa ${attempt + 1})`)
      attempt++
      continue
    }
    const gate = await review(id, wt, base, `${desc} — etapa "${label}" (${agent})`, label)
    cost += gate.cost
    tokens += gate.tokens
    patchCard(id, {}, `${isoNow()} gate crivo [${label}]: ${gate.ok ? gate.verdict : 'NAO EXECUTOU'}${gate.reason ? ` — ${gate.reason}` : ''}`)
    if (!gate.ok) {
      return { metric: { time: Math.round((Date.now() - t0) / 1000), cost, tokens }, ok: false, text, reason: `crivo indisponivel apos ${GATE_RETRIES + 1} tentativa(s): ${gate.reason}` }
    }
    if (gate.verdict !== 'BLOCKED') return { metric: { time: Math.round((Date.now() - t0) / 1000), cost, tokens }, ok: true, text, reason: '' }
    reason = gate.reason
    attempt++
  }
  return { metric: { time: Math.round((Date.now() - t0) / 1000), cost, tokens }, ok: false, text, reason }
}
