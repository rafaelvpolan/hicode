import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import type { CardStatus } from '#shared/types'

export const STATUSES: CardStatus[] = [
  'INBOX', 'READY', 'CLARIFY', 'SPECCED', 'PLAN_APPROVED', 'EXECUTING', 'PAUSED', 'EXECUTED',
  'PREVIEW', 'PREVIEW_OK', 'REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED',
  'CLEANED', 'PR_OPEN', 'MERGED', 'DEPLOYED', 'HALTED',
]

function findRoot(): string {
  for (const c of [process.cwd(), resolve(process.cwd(), '..')]) {
    if (existsSync(join(c, 'cards')) || existsSync(join(c, 'config', 'repos.json'))) return c
  }
  return resolve(process.cwd(), '..')
}

export const ROOT = process.env.HICODE_ROOT || findRoot()
export const CARDS_DIR = join(ROOT, 'cards')
export const CONFIG_DIR = join(ROOT, 'config')
export const REPOS_FILE = join(CONFIG_DIR, 'repos.json')

export function ensure(): void {
  for (const d of [CARDS_DIR, CONFIG_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true })
  if (!existsSync(REPOS_FILE)) writeFileSync(REPOS_FILE, '[]\n')
}

export function isoNow(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z')
}

export function slugify(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tarefa'
}

export interface ParsedCard {
  fm: Record<string, string>
  order: string[]
  body: string
}

export function splitFrontMatter(text: string): ParsedCard {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { fm: {}, order: [], body: text }
  const fm: Record<string, string> = {}
  const order: string[] = []
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) { const k = line.slice(0, i).trim(); fm[k] = line.slice(i + 1).trim(); order.push(k) }
  }
  return { fm, order, body: m[2] }
}

export function serializeCard(fm: Record<string, string>, order: string[], body: string): string {
  const keys = order.length ? order : Object.keys(fm)
  return `---\n${keys.map(k => `${k}: ${fm[k]}`).join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`
}

export function cardFiles(): string[] {
  return existsSync(CARDS_DIR) ? readdirSync(CARDS_DIR).filter(f => f.endsWith('.md')) : []
}

export function findCardFile(id: string): string | null {
  return cardFiles().find(f => f.startsWith(`${id}-`)) || null
}

export function extractObjetivo(body: string): string {
  const m = body.match(/##\s*Objetivo\s*\n([\s\S]*?)(?:\n##\s|$)/)
  return m ? m[1].trim() : ''
}

export function appendLog(body: string, line: string): string {
  const marker = '## Log de Estado'
  if (!body.includes(marker)) return `${body.trimEnd()}\n\n${marker}\n${line}`
  return `${body.trimEnd()}\n${line}`
}

export function extractLog(body: string, tail = 40): string {
  const marker = '## Log de Estado'
  const i = body.indexOf(marker)
  const raw = (i >= 0 ? body.slice(i + marker.length) : body).trim()
  return raw.split('\n').filter((l) => l.trim()).slice(-tail).join('\n')
}

export function haltReason(body: string): string {
  const lines = extractLog(body, 400).split('\n')
  const halt = [...lines].reverse().find((l) => l.includes('HALTED'))
  return halt ? halt.replace(/^\S+Z\s+/, '').trim() : ''
}

export function setObjetivo(body: string, desc: string): string {
  if (body.includes('## Objetivo')) {
    return body.replace(/(##\s*Objetivo\s*\n)([\s\S]*?)(\n##\s|$)/, (_m, h: string, _old: string, tail: string) => `${h}${desc}${tail}`)
  }
  return `## Objetivo\n${desc}\n\n${body.replace(/^\n+/, '')}`
}

export interface RawCard extends Record<string, string> {
  desc: string
  file: string
  halt_reason: string
}

export function readCards(): RawCard[] {
  return cardFiles().map((f) => {
    const { fm, body } = splitFrontMatter(readFileSync(join(CARDS_DIR, f), 'utf8'))
    return { ...fm, desc: extractObjetivo(body), halt_reason: haltReason(body), file: f }
  }).filter((c) => c.id)
}

export function nextId(): string {
  const max = readCards().reduce((a, c) => Math.max(a, Number(c.id) || 0), 0)
  return String(max + 1).padStart(3, '0')
}

export function repoLocalPath(name: string): string {
  return join(dirname(ROOT), basename(name || ''))
}
