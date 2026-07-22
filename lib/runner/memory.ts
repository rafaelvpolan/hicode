import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { isoNow } from '../card'

function memDir(target: string): string {
  return join(target, '.hii', 'memory')
}

export function readProjectMemory(target: string): string {
  const dir = memDir(target)
  if (!existsSync(dir)) return ''
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort()
    const parts: string[] = []
    for (const f of files) {
      try { parts.push(readFileSync(join(dir, f), 'utf8').trim()) } catch { void 0 }
    }
    return parts.filter(Boolean).join('\n\n').slice(0, 2500)
  } catch {
    return ''
  }
}

export function appendProjectMemory(target: string, line: string): void {
  const dir = memDir(target)
  const file = join(dir, 'motor.md')
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const head = existsSync(file) ? readFileSync(file, 'utf8') : '# Memoria do motor (acumulada por card — decisoes e o que foi construido)\n\n'
    writeFileSync(file, `${head}- ${isoNow()} ${line.replace(/\s+/g, ' ').slice(0, 200)}\n`)
  } catch {
    void 0
  }
}
