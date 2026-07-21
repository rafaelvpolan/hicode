import { existsSync, openSync, closeSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { LogResponse } from '#shared/types'

const TAIL_BYTES = 40 * 1024

function tailFile(path: string, maxBytes: number): string {
  const size = statSync(path).size
  const start = Math.max(0, size - maxBytes)
  const length = size - start
  if (length <= 0) return ''
  const buf = Buffer.alloc(length)
  const fd = openSync(path, 'r')
  try {
    readSync(fd, buf, 0, length, start)
  } finally {
    closeSync(fd)
  }
  const text = buf.toString('utf8')
  if (start === 0) return text
  const cutAt = text.indexOf('\n')
  return cutAt >= 0 ? text.slice(cutAt + 1) : text
}

export default defineEventHandler((event): LogResponse => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const file = join(CARDS_DIR, 'runs', `${id}.live.log`)
  if (!existsSync(file)) return { id, log: '' }
  try {
    return { id, log: tailFile(file, TAIL_BYTES) }
  } catch {
    return { id, log: '' }
  }
})
