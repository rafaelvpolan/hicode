import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isoNow } from '../card'
import type { FailureClass, ImplementResult, Run, StepMap } from '../card'
import { cardsDir } from './config'

export const MOTIVO_SEM_CLASSIFICACAO = 'falha nao classificada — tratada como terminal'

export interface ResolvedFailure {
  failureClass: FailureClass
  failureReason: string
}

export function resolvedFailure(res: Pick<ImplementResult, 'failureClass' | 'failureReason'>): ResolvedFailure {
  return {
    failureClass: res.failureClass ?? 'terminal',
    failureReason: res.failureReason ?? MOTIVO_SEM_CLASSIFICACAO,
  }
}

function failureFields(res: ImplementResult): Pick<Run, 'failure_class' | 'failure_reason'> {
  if (res.ok) return { failure_class: '', failure_reason: '' }
  const f = resolvedFailure(res)
  return { failure_class: f.failureClass, failure_reason: f.failureReason }
}

function latestRunPath(id: string): string {
  const dir = join(cardsDir(), 'runs')
  if (!existsSync(dir)) return ''
  const files = readdirSync(dir).filter(f => f.startsWith(`${id}-`) && f.endsWith('.json')).sort()
  const last = files[files.length - 1]
  return last ? join(dir, last) : ''
}

function readRunAt(path: string): Run | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Run
  } catch {
    return null
  }
}

export function writeRun(id: string, res: ImplementResult, durationS = 0, steps: StepMap | null = null): Run {
  const dir = join(cardsDir(), 'runs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const u = res.usage
  const total = (u?.tokens_in || 0) + (u?.tokens_out || 0) + (u?.tokens_cache_create || 0)
  const stepTokens = steps ? Object.values(steps).reduce((a, s) => a + (Number(s.tokens) || 0), 0) : 0
  const safe = isoNow().replace(/[^0-9]/g, '').slice(0, 14)
  const rec: Run = {
    id,
    ts: isoNow(),
    ok: !!res.ok,
    cost_usd: res.cost || '',
    cost_measured: res.costMeasured === true,
    duration_s: durationS,
    tokens_in: u?.tokens_in || 0,
    tokens_out: u?.tokens_out || 0,
    tokens_cache_create: u?.tokens_cache_create || 0,
    tokens_cache_read: u?.tokens_cache_read || 0,
    tokens_total: steps ? stepTokens : total,
    steps: steps || null,
    provider: res.provider || '',
    model: res.model || '',
    ...failureFields(res),
  }
  writeFileSync(join(dir, `${id}-${safe}.json`), JSON.stringify(rec, null, 2))
  return rec
}

function mesmoProvedor(doRegistro: string, queFalhou: string): boolean {
  return queFalhou === '' || doRegistro === '' || doRegistro === queFalhou
}

export function stampRunFailure(id: string, failure: ResolvedFailure, provider: string): boolean {
  const p = latestRunPath(id)
  if (!p) return false
  const r = readRunAt(p)
  if (!r) return false
  const proprio = mesmoProvedor(r.provider || '', provider)
  r.ok = false
  r.failure_class = proprio ? failure.failureClass : ''
  r.failure_reason = proprio ? failure.failureReason : `${failure.failureReason} (provedor ${provider})`
  writeFileSync(p, JSON.stringify(r, null, 2))
  return true
}

export function updateRunSteps(id: string, fsteps: StepMap): { tokens: number; cost: string } {
  const p = latestRunPath(id)
  if (!p) return { tokens: 0, cost: '' }
  const r = readRunAt(p)
  if (!r) return { tokens: 0, cost: '' }
  r.steps = r.steps || {}
  let addTok = 0
  let addCost = 0
  let addTime = 0
  for (const [k, v] of Object.entries(fsteps)) {
    r.steps[k] = v
    addTok += v.tokens || 0
    addCost += v.cost || 0
    addTime += v.time || 0
  }
  r.tokens_total = (Number(r.tokens_total) || 0) + addTok
  r.cost_usd = ((parseFloat(r.cost_usd) || 0) + addCost).toFixed(4)
  r.cost_measured = r.cost_measured === true && !Object.values(fsteps).some(v => v.costMeasured === false)
  r.duration_s = (Number(r.duration_s) || 0) + addTime
  writeFileSync(p, JSON.stringify(r, null, 2))
  return { tokens: r.tokens_total, cost: r.cost_usd }
}

export function readRunSteps(id: string): StepMap | null {
  const p = latestRunPath(id)
  if (!p) return null
  return readRunAt(p)?.steps ?? null
}
