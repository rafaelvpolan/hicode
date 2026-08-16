import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { cardsDir } from './config'
import { downloadToFile } from './download'
import { clip, refuse } from './url-guard'
import type { Refusal } from './url-guard'

const PARECE_URI = /^[a-z][a-z0-9+.-]*:\/\//i
const PARECE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/i

function isInRefsDir(p: string, id: string): boolean {
  return resolve(p).startsWith(`${resolve(refsDir(id))}/`)
}

function refsFile(id: string): string {
  return join(cardsDir(), 'refs', `${id}.json`)
}

function refsDir(id: string): string {
  return join(cardsDir(), 'refs', id)
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

function pareceHostSemEsquema(s: string): boolean {
  if (s.startsWith('/') || s.startsWith('.')) return false
  return PARECE_HOST.test(s.split(/[/?#]/)[0] ?? '')
}

function recusaFonteLocal(s: string, id: string): Refusal {
  const aceito = `cards/refs/${id}/`
  if (pareceHostSemEsquema(s)) {
    return refuse('fonte-invalida', `fonte sem esquema: ${clip(s)} — informe a URL completa com http:// ou https://`)
  }
  if (existsSync(s)) {
    return refuse('fonte-invalida', `arquivo fora de ${aceito}: ${clip(s)}`)
  }
  return refuse('fonte-invalida', `nao e URL http(s) nem arquivo em ${aceito}: ${clip(s)}`)
}

export interface RefOutcome {
  source: string
  path: string
  refusal: Refusal | null
}

export async function resolveRefs(id: string): Promise<RefOutcome[]> {
  const sources = readRefSources(id)
  if (!sources.length) return []
  const dir = refsDir(id)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const out: RefOutcome[] = []
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i] ?? ''
    if (PARECE_URI.test(s)) {
      const r = await downloadToFile(s, join(dir, `ref-${i}${extFromUrl(s)}`))
      out.push({ source: s, path: r.ok ? r.path : '', refusal: r.ok ? null : r })
      continue
    }
    if (existsSync(s) && isInRefsDir(s, id)) {
      out.push({ source: s, path: s, refusal: null })
      continue
    }
    out.push({ source: s, path: '', refusal: recusaFonteLocal(s, id) })
  }
  return out
}

export function refPaths(outcomes: RefOutcome[]): string[] {
  return outcomes.filter(o => o.path).map(o => o.path)
}
