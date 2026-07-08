import { allCards, createCard } from '../runner/card-store'
import { taskSync } from './registry'

export interface SyncReport {
  pulled: number
  created: number
  pushed: number
}

export async function runSync(): Promise<SyncReport> {
  const sync = taskSync()
  if (!sync) return { pulled: 0, created: 0, pushed: 0 }
  const cards = allCards()
  const seen = new Set(cards.map(c => c.source).filter(Boolean))
  const external = await sync.pull()
  let created = 0
  for (const t of external) {
    const source = `${sync.name}#${t.externalId}`
    if (seen.has(source)) continue
    createCard({ status: 'READY', title: t.title, source }, `## Objetivo\n${t.body || t.title}\n`)
    seen.add(source)
    created++
  }
  let pushed = 0
  for (const c of cards) {
    if (c.source && String(c.source).startsWith(`${sync.name}#`)) {
      await sync.push(c)
      pushed++
    }
  }
  return { pulled: external.length, created, pushed }
}
