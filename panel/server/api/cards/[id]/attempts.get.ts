import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Attempt, AttemptsResponse } from '#shared/types'

export default defineEventHandler((event): AttemptsResponse => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const file = join(CARDS_DIR, 'runs', `${id}.attempts.json`)
  if (!existsSync(file)) return { id, attempts: [] }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Attempt[]
    return { id, attempts: Array.isArray(parsed) ? parsed : [] }
  } catch {
    return { id, attempts: [] }
  }
})
