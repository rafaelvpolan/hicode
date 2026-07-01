import { existsSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CardRecord, CardRisk, CardStatus } from '#shared/types'
import {
  CARDS_DIR, appendLog, ensure, findCardFile, isoNow, nextId,
  serializeCard, setObjetivo, slugify, splitFrontMatter,
} from './card-io'

export interface CreateCardInput {
  title: string
  risk?: string
  repo?: string
  desc?: string
}

function createCard(input: CreateCardInput): Record<string, string> {
  const id = nextId()
  const slug = slugify(input.title)
  const fm: Record<string, string> = {
    id, slug, title: input.title,
    status: 'READY', risk: input.risk === 'high' ? 'high' : 'low',
    repo: input.repo || '', created: isoNow(), updated: isoNow(),
  }
  const objetivo = (input.desc && input.desc.trim()) ? input.desc.trim() : input.title
  const body = `## Objetivo\n${objetivo}\n\n## Log de Estado\n${isoNow()} CREATED status=READY (sprint)`
  writeFileSync(join(CARDS_DIR, `${id}-${slug}.md`), serializeCard(fm, Object.keys(fm), body) + '\n')
  return { ...fm }
}

export interface SprintFeatureInput {
  title: string
  risk?: string
  desc?: string
}

export interface CreateSprintResult {
  ok: true
  created: number
  cards: Record<string, string>[]
}

export function createSprint(repo: string, features: SprintFeatureInput[]): CreateSprintResult {
  ensure()
  const created = (features || []).filter((f) => f && f.title).map((f) => createCard({ title: f.title, risk: f.risk, repo, desc: f.desc }))
  return { ok: true, created: created.length, cards: created }
}

export function transition(id: string, status: CardStatus, note?: string): CardRecord | null {
  const f = findCardFile(id)
  if (!f) return null
  const p = join(CARDS_DIR, f)
  const { fm, order, body } = splitFrontMatter(readFileSync(p, 'utf8'))
  const from = fm.status || 'INBOX'
  fm.status = status
  fm.updated = isoNow()
  const nb = appendLog(body, `${isoNow()} ${from}->${status}${note ? ' ' + note : ''}`)
  writeFileSync(p, serializeCard(fm, order, nb) + '\n')
  return { ...fm, file: f }
}

export interface EditCardFields {
  title?: string
  desc?: string
  risk?: CardRisk
}

export function editCard(id: string, fields: EditCardFields): CardRecord | null {
  const f = findCardFile(id)
  if (!f) return null
  const p = join(CARDS_DIR, f)
  const { fm, order, body } = splitFrontMatter(readFileSync(p, 'utf8'))
  const keys = order.length ? order : Object.keys(fm)
  if (typeof fields.title === 'string' && fields.title.trim()) { fm.title = fields.title.trim(); if (!keys.includes('title')) keys.push('title') }
  if (fields.risk === 'high' || fields.risk === 'low') fm.risk = fields.risk
  let nb = body
  if (typeof fields.desc === 'string' && fields.desc.trim()) nb = setObjetivo(body, fields.desc.trim())
  let logLine = `${isoNow()} EDIT tarefa via painel`
  if (fm.status === 'EXECUTING') { fm.status = 'PAUSED'; logLine = `${isoNow()} EXECUTING->PAUSED editado (auto-pausa)` }
  fm.updated = isoNow()
  nb = appendLog(nb, logLine)
  writeFileSync(p, serializeCard(fm, keys, nb) + '\n')
  return { ...fm, file: f }
}

export function deleteCard(id: string): boolean {
  const f = findCardFile(id)
  if (!f) return false
  rmSync(join(CARDS_DIR, f))
  const prev = join(CARDS_DIR, 'previews', String(id))
  if (existsSync(prev)) rmSync(prev, { recursive: true, force: true })
  return true
}

export function previewFile(id: string): string | null {
  const p = join(CARDS_DIR, 'previews', String(id).padStart(3, '0'), 'preview.png')
  return existsSync(p) ? p : null
}
