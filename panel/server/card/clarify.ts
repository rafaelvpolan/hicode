import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ClarifyQuestion } from '#shared/types'
import { cardsDir } from '../motor/ambiente'

function clarifyFile(id: string): string {
  return join(cardsDir(), 'runs', `${id}.clarify.json`)
}

export function readClarify(id: string): ClarifyQuestion[] {
  const f = clarifyFile(id)
  if (!existsSync(f)) return []
  try {
    const parsed = JSON.parse(readFileSync(f, 'utf8')) as ClarifyQuestion[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeClarify(id: string, questions: ClarifyQuestion[]): void {
  const dir = join(cardsDir(), 'runs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(clarifyFile(id), JSON.stringify(questions, null, 2))
}
