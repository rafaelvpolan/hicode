import { isoNow } from '../card'
import type { StepMetric } from '../card'
import { MAX_REAJUSTE } from './config'
import { patchCard } from './card-store'
import { runStep } from './agent'
import { runGatedReview } from './codefox-gate'

export interface GatedResult {
  metric: StepMetric
  ok: boolean
  text: string
  reason: string
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
    const r = await runStep(wt, agent, instruction + suffix)
    cost += r.cost
    tokens += r.tokens
    text = r.text
    if (!r.ok) {
      reason = `agente ${agent} falhou/timeout`
      patchCard(id, {}, `${isoNow()} step [${label}] ${agent}: FALHOU/timeout (tentativa ${attempt + 1})`)
      attempt++
      continue
    }
    const gate = await runGatedReview(wt, base, `${desc} — etapa "${label}" (${agent})`)
    cost += gate.cost
    tokens += gate.tokens
    patchCard(id, {}, `${isoNow()} gate crivo [${label}]: ${gate.ok ? gate.verdict : 'NAO EXECUTOU'}${gate.reason ? ` — ${gate.reason}` : ''}`)
    if (gate.ok && gate.verdict !== 'BLOCKED') return { metric: { time: Math.round((Date.now() - t0) / 1000), cost, tokens }, ok: true, text, reason: '' }
    reason = gate.ok ? gate.reason : `crivo nao executou: ${gate.reason}`
    attempt++
  }
  return { metric: { time: Math.round((Date.now() - t0) / 1000), cost, tokens }, ok: false, text, reason }
}
