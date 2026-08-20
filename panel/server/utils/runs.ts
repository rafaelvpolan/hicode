import type { RunView } from '#shared/types'
import { readCards } from './card-io'
import { lerExecucoes, type ExecucaoEmDisco } from '../motor/execucoes'

function paraRunView(execucao: ExecucaoEmDisco, titleById: Record<string, string>): RunView {
  return {
    id: execucao.cardId,
    ts: execucao.ts,
    title: titleById[execucao.cardId] || ('#' + execucao.cardId),
    tokens_total: execucao.tokensTotal,
    cost_usd: execucao.custoUsd,
    cost_measured: execucao.custoMedido,
    duration_s: execucao.duracaoS,
    steps: execucao.steps ?? undefined,
  }
}

export function getRuns(): RunView[] {
  const titleById: Record<string, string> = {}
  for (const c of readCards()) titleById[c.id] = c.title || c.slug || ''
  const { execucoes } = lerExecucoes()
  const runs = execucoes
    .filter(execucao => execucao.tipo === 'execucao')
    .map(execucao => paraRunView(execucao, titleById))
  runs.sort((a, b) => a.ts.localeCompare(b.ts))
  return runs
}

export function getStepEstimates(): Record<string, number> {
  const sums: Record<string, number> = {}
  const counts: Record<string, number> = {}
  for (const r of getRuns()) {
    if (!r.steps) continue
    for (const [key, metric] of Object.entries(r.steps)) {
      if (!metric || !(metric.time > 0)) continue
      sums[key] = (sums[key] || 0) + metric.time
      counts[key] = (counts[key] || 0) + 1
    }
  }
  const estimates: Record<string, number> = {}
  for (const key of Object.keys(sums)) estimates[key] = Math.round((sums[key] ?? 0) / (counts[key] || 1))
  return estimates
}
