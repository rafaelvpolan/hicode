import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Attempt, FailureAttempt, TentativasDoCard } from '#shared/types'
import { cardsDir } from './ambiente'

function attemptsFile(id: string): string {
  return join(cardsDir(), 'runs', `${id}.attempts.json`)
}

function failuresFile(id: string): string {
  return join(cardsDir(), 'runs', `${id}.failures.jsonl`)
}

function lerAttempts(id: string): Attempt[] {
  const f = attemptsFile(id)
  if (!existsSync(f)) return []
  try {
    const parsed = JSON.parse(readFileSync(f, 'utf8')) as Attempt[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseFailureAttempt(linha: string): FailureAttempt | null {
  try {
    return JSON.parse(linha) as FailureAttempt
  } catch {
    return null
  }
}

function lerFailureAttempts(id: string): FailureAttempt[] {
  const f = failuresFile(id)
  if (!existsSync(f)) return []
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter(linha => linha.trim() !== '')
    .map(parseFailureAttempt)
    .filter((r): r is FailureAttempt => r !== null)
}

export function tentativasDoCard(id: string): TentativasDoCard {
  return {
    cardId: id,
    reprovacoesECorrecoes: lerAttempts(id).length,
    reajustes: lerFailureAttempts(id),
  }
}
