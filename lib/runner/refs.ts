import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CARDS_DIR } from './config'
import { run } from './git'

function refsFile(id: string): string {
  return join(CARDS_DIR, 'refs', `${id}.json`)
}

function refsDir(id: string): string {
  return join(CARDS_DIR, 'refs', id)
}

export function readRefSources(id: string): string[] {
  const f = refsFile(id)
  if (!existsSync(f)) return []
  try {
    const parsed = JSON.parse(readFileSync(f, 'utf8')) as string[]
    return Array.isArray(parsed) ? parsed.map(s => String(s)).filter(Boolean).slice(0, 8) : []
  } catch {
    return []
  }
}

function extFromUrl(url: string): string {
  const m = String(url).split('?')[0]?.match(/\.(png|jpe?g|webp|gif|svg)$/i)
  return m ? m[0].toLowerCase() : '.png'
}

export async function resolveRefImages(id: string): Promise<string[]> {
  const sources = readRefSources(id)
  if (!sources.length) return []
  const dir = refsDir(id)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const out: string[] = []
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i] ?? ''
    if (/^https?:\/\//.test(s)) {
      const dest = join(dir, `ref-${i}${extFromUrl(s)}`)
      const r = await run('curl', ['-sL', '--max-time', '30', '-o', dest, s], { timeout: 35000 })
      if (!r.err && existsSync(dest)) out.push(dest)
    } else if (existsSync(s)) {
      out.push(s)
    }
  }
  return out
}
