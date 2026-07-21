import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { RunView } from '#shared/types'
import { CARDS_DIR, readCards } from './card-io'

export function getRuns(): RunView[] {
  const dir = join(CARDS_DIR, 'runs')
  if (!existsSync(dir)) return []
  const titleById: Record<string, string> = {}
  for (const c of readCards()) titleById[c.id] = c.title || c.slug || ''
  const out = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    try {
      const r = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Omit<RunView, 'title'> & { id: string }
      return { ...r, title: titleById[r.id] || ('#' + r.id) } as RunView
    } catch { return null }
  }).filter((r): r is RunView => r !== null)
  out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
  return out
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
