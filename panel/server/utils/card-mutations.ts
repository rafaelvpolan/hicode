import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CardRecord, CardRisk, CardStatus } from '#shared/types'
import type { Fields } from '../../../lib/card'
import * as core from '../../../lib/core/actions'
import { CARDS_DIR, ensure } from './card-io'

function record(fields: Fields | null): CardRecord | null {
  return fields ? { ...fields, file: fields.file ?? '' } : null
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
  const cards = (features || [])
    .filter((f) => f && f.title)
    .map((f) => ({ id: core.submit({ title: f.title, risk: f.risk, repo, desc: f.desc }) }))
  return { ok: true, created: cards.length, cards }
}

export function resumeFrom(id: string, step: string): CardRecord | null {
  return record(core.resumeFrom(id, step))
}

export function transition(id: string, status: CardStatus, note?: string): CardRecord | null {
  return record(core.transition(id, status, note))
}

export function requestCorrection(id: string, file: string, instruction: string, line = '', lineText = ''): CardRecord | null {
  return record(core.requestCorrection(id, file, instruction, line, lineText))
}

export interface ClarifyAnswerInput {
  q: string
  answer: string
}

export function answerClarify(id: string, answers: ClarifyAnswerInput[]): CardRecord | null {
  return record(core.answerClarify(id, answers))
}

export interface EditCardFields {
  title?: string
  desc?: string
  risk?: CardRisk
}

export function editCard(id: string, fields: EditCardFields): CardRecord | null {
  return record(core.edit(id, fields))
}

export function deleteCard(id: string): boolean {
  return core.remove(id)
}

export function setPreviewPid(id: string, pid: number, hard = false): CardRecord | null {
  return record(core.setPreviewPid(id, pid, hard))
}

export function previewFile(id: string): string | null {
  const p = join(CARDS_DIR, 'previews', String(id).padStart(3, '0'), 'preview.png')
  return existsSync(p) ? p : null
}
