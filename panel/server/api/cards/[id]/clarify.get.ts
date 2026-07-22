import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ClarifyQuestion, ClarifyResponse } from '#shared/types'

export default defineEventHandler((event): ClarifyResponse => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const file = join(CARDS_DIR, 'runs', `${id}.clarify.json`)
  if (!existsSync(file)) return { id, questions: [] }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as ClarifyQuestion[]
    return { id, questions: Array.isArray(parsed) ? parsed : [] }
  } catch {
    return { id, questions: [] }
  }
})
