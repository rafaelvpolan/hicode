import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { splitFrontMatter, serializeCard } from './frontmatter'
import { appendLog } from './texto'
import { isoNow } from './util'
import { cardFiles, findCardFile } from './arquivos'
import { withFileLock, writeFileAtomic } from './bloqueio'
import { cardsDir } from '../motor/ambiente'
import type { Card, Fields } from './tipos'

export function readCard(id: string): Card | null {
  const f = findCardFile(id)
  if (!f) return null
  return { ...splitFrontMatter(readFileSync(join(cardsDir(), f), 'utf8')), file: f }
}

export interface CardPatch {
  fields?: Fields | ((fm: Fields) => Fields)
  body?: (body: string, fm: Fields) => string
  log?: string | ((fm: Fields) => string)
}

export function updateCard(id: string, patch: CardPatch): Fields | null {
  const name = findCardFile(id)
  if (!name) return null
  const file = join(cardsDir(), name)
  return withFileLock(file, () => {
    const { fm, order, body } = splitFrontMatter(readFileSync(file, 'utf8'))
    const before: Fields = { ...fm }
    const resolvedFields = typeof patch.fields === 'function' ? patch.fields(before) : (patch.fields ?? {})
    for (const [k, v] of Object.entries(resolvedFields)) {
      fm[k] = v
      if (!order.includes(k)) order.push(k)
    }
    fm.updated = isoNow()
    let nb = patch.body ? patch.body(body, before) : body
    const line = typeof patch.log === 'function' ? patch.log(before) : patch.log
    if (line) nb = appendLog(nb, line)
    writeFileAtomic(file, serializeCard(fm, order, nb) + '\n')
    return { ...fm, file: name }
  })
}

function proximoId(): string {
  const max = cardFiles().reduce((a, f) => {
    const id = Number(splitFrontMatter(readFileSync(join(cardsDir(), f), 'utf8')).fm.id) || 0
    return Math.max(a, id)
  }, 0)
  return String(max + 1).padStart(3, '0')
}

export function createCard(fields: Fields, body: string): string {
  const id = proximoId()
  const fm: Fields = { id, status: 'READY', ...fields, updated: isoNow() }
  const order = Object.keys(fm)
  writeFileSync(join(cardsDir(), `${id}-${fields.slug || 'tarefa'}.md`), serializeCard(fm, order, body) + '\n')
  return id
}
