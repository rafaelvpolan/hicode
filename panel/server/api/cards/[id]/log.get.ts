import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LogResponse } from '#shared/types'

export default defineEventHandler((event): LogResponse => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const f = findCardFile(id)
  if (!f) { setResponseStatus(event, 404); return { id, log: '', error: 'card nao encontrado' } }
  const { body } = splitFrontMatter(readFileSync(join(CARDS_DIR, f), 'utf8'))
  return { id, log: extractLog(body) }
})
