import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isoNow } from '../card'
import type { FailureClass } from '../card'
import { cardsDir } from './config'

export type AttemptKind = 'reprovacao' | 'correcao'

export type FailureOutcome = 'waiting' | 'halt'

export interface Attempt {
  ts: string
  kind: AttemptKind
  reason: string
  response: string
}

export interface FailureAttempt {
  ts: string
  attempt: number
  fromStatus: string
  provider: string
  failureClass: FailureClass
  failureReason: string
  outcome: FailureOutcome
}

function ensureRunsDir(): void {
  const dir = join(cardsDir(), 'runs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function attemptsFile(id: string): string {
  return join(cardsDir(), 'runs', `${id}.attempts.json`)
}

function failuresFile(id: string): string {
  return join(cardsDir(), 'runs', `${id}.failures.jsonl`)
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
  ensureRunsDir()
  const list = readAttempts(id)
  list.push({ ts: isoNow(), kind, reason: String(reason || '').slice(0, 2000), response: String(response || '').slice(0, 8000) })
  writeFileSync(attemptsFile(id), JSON.stringify(list, null, 2))
}

function parseFailureAttempt(linha: string): FailureAttempt | null {
  try {
    return JSON.parse(linha) as FailureAttempt
  } catch {
    return null
  }
}

export function readFailureAttempts(id: string): FailureAttempt[] {
  const f = failuresFile(id)
  if (!existsSync(f)) return []
  const linhas = readFileSync(f, 'utf8').split('\n').filter(l => l.trim() !== '')
  return linhas.map(parseFailureAttempt).filter((r): r is FailureAttempt => r !== null)
}

export function appendFailureAttempt(id: string, entry: Omit<FailureAttempt, 'ts'>): void {
  ensureRunsDir()
  const registro: FailureAttempt = { ts: isoNow(), ...entry, failureReason: String(entry.failureReason || '').slice(0, 500) }
  appendFileSync(failuresFile(id), `${JSON.stringify(registro)}\n`)
}
