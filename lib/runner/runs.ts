import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isoNow } from '../card'
import type { ImplementResult, Run, StepMap } from '../card'
import { CARDS_DIR } from './config'

export function writeRun(id: string, res: ImplementResult, durationS = 0, steps: StepMap | null = null): Run {
  const dir = join(CARDS_DIR, 'runs')
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
    duration_s: durationS,
    tokens_in: u?.tokens_in || 0,
    tokens_out: u?.tokens_out || 0,
    tokens_cache_create: u?.tokens_cache_create || 0,
    tokens_cache_read: u?.tokens_cache_read || 0,
    tokens_total: steps ? stepTokens : total,
    steps: steps || null,
  }
  writeFileSync(join(dir, `${id}-${safe}.json`), JSON.stringify(rec, null, 2))
  return rec
}

export function updateRunSteps(id: string, fsteps: StepMap): { tokens: number; cost: string } {
  const dir = join(CARDS_DIR, 'runs')
  if (!existsSync(dir)) return { tokens: 0, cost: '' }
  const files = readdirSync(dir).filter(f => f.startsWith(`${id}-`) && f.endsWith('.json')).sort()
  const last = files[files.length - 1]
  if (!last) return { tokens: 0, cost: '' }
  const p = join(dir, last)
  let r: Run
  try {
    r = JSON.parse(readFileSync(p, 'utf8')) as Run
  } catch {
    return { tokens: 0, cost: '' }
  }
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
  r.duration_s = (Number(r.duration_s) || 0) + addTime
  writeFileSync(p, JSON.stringify(r, null, 2))
  return { tokens: r.tokens_total, cost: r.cost_usd }
}
