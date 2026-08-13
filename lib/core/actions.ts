import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { appendLog, isoNow, setObjetivo, slugify } from '../card'
import type { Fields } from '../card'
import { cardsDir } from '../runner/config'
import { createCard, findCardFile, readCard, updateCard } from '../runner/card-store'
import { readClarify, writeClarify } from '../runner/clarify'

export interface NewCardInput {
  title: string
  repo?: string
  risk?: string
  desc?: string
  layout?: string
  pilha?: string
  ai?: string
  effort?: string
}

export interface ClarifyAnswer {
  q: string
  answer: string
}

export type ActionResult = Fields | null

function optional(fields: Record<string, string | undefined>): Fields {
  const out: Fields = {}
  for (const [k, v] of Object.entries(fields)) if (v) out[k] = v
  return out
}

export function submit(input: NewCardInput): string {
  const objetivo = (input.desc ?? '').trim() || input.title
  const body = `## Objetivo\n${objetivo}\n\n## Log de Estado\n${isoNow()} CREATED status=READY`
  return createCard({
    slug: slugify(input.title),
    title: input.title,
    status: 'READY',
    risk: input.risk === 'high' ? 'high' : 'low',
    repo: input.repo ?? '',
    created: isoNow(),
    ...optional({ layout: input.layout, pilha: input.pilha, ai: input.ai, effort: input.effort }),
  }, body)
}

export function transition(id: string, status: string, note?: string): ActionResult {
  return updateCard(id, {
    fields: { status },
    log: fm => `${isoNow()} ${fm.status || 'INBOX'}->${status}${note ? ' ' + note : ''}`,
  })
}

export function resumeFrom(id: string, step: string): ActionResult {
  return updateCard(id, {
    fields: { resume_from: step, status: 'PREVIEW_OK' },
    log: fm => `${isoNow()} ${fm.status || 'INBOX'}->PREVIEW_OK replay a partir de ${step}`,
  })
}

export function approvePreview(id: string): ActionResult {
  return transition(id, 'PREVIEW_OK', 'aprovado pelo humano')
}

export function halt(id: string, reason: string): ActionResult {
  return transition(id, 'HALTED', reason)
}

export function requestCorrection(id: string, file: string, instruction: string, line = '', lineText = ''): ActionResult {
  const card = readCard(id)
  if (!card) return null
  if (card.fm.status !== 'PREVIEW') return null
  if (!card.fm.worktree || !existsSync(join(card.fm.worktree, '.git'))) return null
  const anchor = file ? `${file}${line ? ':' + line : ''}` : '(geral)'
  return updateCard(id, {
    fields: {
      correction: instruction,
      correction_file: file,
      correction_line: line,
      correction_line_text: lineText.replace(/[\r\n]+/g, ' '),
      status: 'CORRECTING',
    },
    log: fm => `${isoNow()} ${fm.status || 'INBOX'}->CORRECTING correção: ${anchor} — ${instruction.slice(0, 120)}`,
  })
}

export function answerClarify(id: string, answers: ClarifyAnswer[]): ActionResult {
  const questions = readClarify(id)
  if (!questions.length) return null
  for (const a of answers) {
    const match = questions.find(q => q.q === a.q)
    if (match) match.answer = a.answer
  }
  writeClarify(id, questions)
  return updateCard(id, {
    fields: { clarified: 'true', status: 'EXECUTING' },
    log: `${isoNow()} CLARIFY->EXECUTING respondido (${answers.length} resposta(s))`,
  })
}

export interface EditInput {
  title?: string
  desc?: string
  risk?: string
}

export function edit(id: string, fields: EditInput): ActionResult {
  const card = readCard(id)
  if (!card) return null
  const pausa = card.fm.status === 'EXECUTING'
  const title = fields.title?.trim()
  const desc = fields.desc?.trim()
  return updateCard(id, {
    fields: {
      ...optional({ title, risk: fields.risk === 'high' || fields.risk === 'low' ? fields.risk : undefined }),
      ...(pausa ? { status: 'PAUSED' } : {}),
    },
    body: body => (desc ? setObjetivo(body, desc) : body),
    log: pausa ? `${isoNow()} EXECUTING->PAUSED editado (auto-pausa)` : `${isoNow()} EDIT tarefa`,
  })
}

export function setPreviewPid(id: string, pid: number, hard = false): ActionResult {
  return updateCard(id, {
    fields: { preview_pid: String(pid) },
    log: `${isoNow()} RESET preview reiniciado (pid ${pid}${hard ? ', cache limpo' : ''})`,
  })
}

export function remove(id: string): boolean {
  const f = findCardFile(id)
  if (!f) return false
  rmSync(join(cardsDir(), f))
  const prev = join(cardsDir(), 'previews', String(id))
  if (existsSync(prev)) rmSync(prev, { recursive: true, force: true })
  return true
}

export { appendLog }
