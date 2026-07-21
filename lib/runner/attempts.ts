import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isoNow } from '../card'
import { CARDS_DIR } from './config'

export type AttemptKind = 'reprovacao' | 'correcao'

export interface Attempt {
  ts: string
  kind: AttemptKind
  reason: string
  response: string
}

function attemptsFile(id: string): string {
  return join(CARDS_DIR, 'runs', `${id}.attempts.json`)
}

export function readAttempts(id: string): Attempt[] {
  const f = attemptsFile(id)
  if (!existsSync(f)) return []
  try {
    const parsed = JSON.parse(readFileSync(f, 'utf8')) as Attempt[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function appendAttempt(id: string, kind: AttemptKind, reason: string, response: string): void {
  const dir = join(CARDS_DIR, 'runs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const list = readAttempts(id)
  list.push({ ts: isoNow(), kind, reason: String(reason || '').slice(0, 2000), response: String(response || '').slice(0, 8000) })
  writeFileSync(attemptsFile(id), JSON.stringify(list, null, 2))
}
