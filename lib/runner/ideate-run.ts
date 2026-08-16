import { ROOT } from './config'
import { providerFor, modelFor } from '../ai/registry'
import { runProvider } from './cost-trust'
import { sumTokens } from '../ai/usage'
import {
  escolherLentes, promptDivergir, promptConvergir,
  parseIdeias, parseConvergencia,
} from '../core/ideate'
import type { Convergencia } from '../core/ideate'

export const IDEATE_LENTES = Number(process.env.HICODE_IDEATE_FRAMES || 4)
export const IDEATE_IDEIAS = Number(process.env.HICODE_IDEATE_IDEAS || 5)
export const IDEATE_TOPK = Number(process.env.HICODE_IDEATE_TOPK || 3)

export interface IdeacaoResultado {
  ok: boolean
  motivo: string
  convergencia: Convergencia | null
  ideias: number
  cost: number
  tokens: number
}

async function chamar(prompt: string, timeoutMs: number, id: string): Promise<{ texto: string; cost: number; tokens: number; ok: boolean }> {
  const provider = providerFor('verify')
  const res = await runProvider(id, provider, {
    prompt, cwd: ROOT, dirs: [], mode: 'readonly',
    useAgents: false, model: modelFor('verify'), timeoutMs,
  })
  return { texto: res.text, cost: res.cost, tokens: sumTokens(res.usage), ok: res.ok }
}

export async function idear(objetivo: string, semente: string): Promise<IdeacaoResultado> {
  const lentes = escolherLentes(IDEATE_LENTES, semente)
  const ramos = await Promise.all(
    lentes.map(l => chamar(promptDivergir(l, objetivo, IDEATE_IDEIAS), 120000, semente)
      .then(r => ({ lente: l.nome, ...r }))),
  )
  const cost = ramos.reduce((a, r) => a + r.cost, 0)
  const tokens = ramos.reduce((a, r) => a + r.tokens, 0)
  const ideias = ramos.flatMap(r => (r.ok ? parseIdeias(r.texto, r.lente) : []))
  if (!ideias.length) {
    return { ok: false, motivo: 'nenhuma ideia parseavel nos ramos', convergencia: null, ideias: 0, cost, tokens }
  }
  const critico = await chamar(promptConvergir(objetivo, ideias, IDEATE_TOPK), 180000, semente)
  const total = { cost: cost + critico.cost, tokens: tokens + critico.tokens }
  if (!critico.ok) {
    return { ok: false, motivo: 'o critico nao executou', convergencia: null, ideias: ideias.length, ...total }
  }
  const convergencia = parseConvergencia(critico.texto, ideias)
  if (!convergencia || !convergencia.shortlist.length) {
    return { ok: false, motivo: 'critico sem veredito parseavel', convergencia: null, ideias: ideias.length, ...total }
  }
  return { ok: true, motivo: `${lentes.length} lentes · ${ideias.length} ideias`, convergencia, ideias: ideias.length, ...total }
}
