import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LogResponse } from '#shared/types'

export default defineEventHandler((event): LogResponse => {
  const id = parseCardId(getRouterParam(event, 'id'))
  if (!id) { setResponseStatus(event, 400); return { id: '', log: '', error: 'id invalido' } }
  const f = findCardFile(id)
  if (!f) { setResponseStatus(event, 404); return { id, log: '', error: 'card nao encontrado' } }
  const { body } = splitFrontMatter(readFileSync(join(CARDS_DIR, f), 'utf8'))
  return { id, log: extractLog(body) }
})
