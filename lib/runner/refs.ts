import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CARDS_DIR } from './config'
import { run } from './git'

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return true
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true
  if (/^(fe80|fc00|fd)/i.test(h)) return true
  return false
}

function safeHttpUrl(s: string): string | null {
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (isBlockedHost(u.hostname)) return null
    return u.toString()
  } catch {
    return null
  }
}

function isInRefsDir(p: string, id: string): boolean {
  return resolve(p).startsWith(`${resolve(refsDir(id))}/`)
}

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
      const safe = safeHttpUrl(s)
      if (!safe) continue
      const dest = join(dir, `ref-${i}${extFromUrl(s)}`)
      const r = await run('curl', ['-sL', '--max-redirs', '3', '--max-filesize', '10485760', '--max-time', '30', '-o', dest, safe], { timeout: 35000 })
      if (!r.err && existsSync(dest)) out.push(dest)
    } else if (existsSync(s) && isInRefsDir(s, id)) {
      out.push(s)
    }
  }
  return out
}
