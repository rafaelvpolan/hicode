import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import type { CardStatus } from '#shared/types'
import {
  STATUSES as CORE_STATUSES, appendLog, extractObjetivo, isoNow,
  serializeCard, setObjetivo, slugify, splitFrontMatter,
} from '../../../lib/card'
import { cardsDir, reposFile, ROOT as CORE_ROOT } from '../../../lib/runner/config'
import { cardFiles, findCardFile } from '../../../lib/runner/card-store'

export const STATUSES: CardStatus[] = [...CORE_STATUSES]
export const ROOT = CORE_ROOT
export const CARDS_DIR = cardsDir()
export const CONFIG_DIR = join(ROOT, 'config')
export const REPOS_FILE = reposFile()

export { appendLog, extractObjetivo, findCardFile, isoNow, serializeCard, setObjetivo, slugify, splitFrontMatter, cardFiles }

export function ensure(): void {
  for (const d of [CARDS_DIR, CONFIG_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true })
  if (!existsSync(REPOS_FILE)) writeFileSync(REPOS_FILE, '[]\n')
}

export interface ParsedCard {
  fm: Record<string, string>
  order: string[]
  body: string
}

export function extractLog(body: string, tail = 40): string {
  const marker = '## Log de Estado'
  const i = body.indexOf(marker)
  const raw = (i >= 0 ? body.slice(i + marker.length) : body).trim()
  return raw.split('\n').filter((l) => l.trim()).slice(-tail).join('\n')
}

export function haltReason(body: string): string {
  const lines = extractLog(body, 400).split('\n')
  const halt = [...lines].reverse().find((l) => l.includes('HALTED'))
  return halt ? halt.replace(/^\S+Z\s+/, '').trim() : ''
}

export interface RawCard {
  [field: string]: string | undefined
  desc: string
  file: string
  halt_reason: string
}

export interface IdentifiedCard extends RawCard {
  id: string
}

function hasId(card: RawCard): card is IdentifiedCard {
  return typeof card.id === 'string' && card.id !== ''
}

export function readCards(): IdentifiedCard[] {
  return cardFiles().map((f): RawCard => {
    const { fm, body } = splitFrontMatter(readFileSync(join(CARDS_DIR, f), 'utf8'))
    return { ...fm, desc: extractObjetivo(body), halt_reason: haltReason(body), file: f }
  }).filter(hasId)
}

export function nextId(): string {
  const max = readCards().reduce((a, c) => Math.max(a, Number(c.id) || 0), 0)
  return String(max + 1).padStart(3, '0')
}

export function repoLocalPath(name: string): string {
  return join(dirname(ROOT), basename(name || ''))
}
