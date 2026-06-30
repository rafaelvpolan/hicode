import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const STATUSES = ['INBOX', 'READY', 'SPECCED', 'PLAN_APPROVED', 'EXECUTING', 'PAUSED', 'EXECUTED', 'PREVIEW', 'PREVIEW_OK', 'REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED', 'CLEANED', 'PR_OPEN', 'MERGED', 'DEPLOYED', 'HALTED']

function findRoot(): string {
  for (const c of [process.cwd(), resolve(process.cwd(), '..')]) {
    if (existsSync(join(c, 'cards')) || existsSync(join(c, 'config', 'repos.json'))) return c
  }
  return resolve(process.cwd(), '..')
}

const ROOT = process.env.HICODE_ROOT || findRoot()
const CARDS_DIR = join(ROOT, 'cards')
const CONFIG_DIR = join(ROOT, 'config')
const REPOS_FILE = join(CONFIG_DIR, 'repos.json')

function ensure(): void {
  for (const d of [CARDS_DIR, CONFIG_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true })
  if (!existsSync(REPOS_FILE)) writeFileSync(REPOS_FILE, '[]\n')
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z')
}

function slugify(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tarefa'
}

type Parsed = { fm: Record<string, string>, order: string[], body: string }

function splitFrontMatter(text: string): Parsed {
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

function serializeCard(fm: Record<string, string>, order: string[], body: string): string {
  const keys = order.length ? order : Object.keys(fm)
  return `---\n${keys.map(k => `${k}: ${fm[k]}`).join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`
}

function cardFiles(): string[] {
  return existsSync(CARDS_DIR) ? readdirSync(CARDS_DIR).filter(f => f.endsWith('.md')) : []
}

function findCardFile(id: string): string | null {
  return cardFiles().find(f => f.startsWith(`${id}-`)) || null
}

function extractObjetivo(body: string): string {
  const m = body.match(/##\s*Objetivo\s*\n([\s\S]*?)(?:\n##\s|$)/)
  return m ? m[1].trim() : ''
}

function appendLog(body: string, line: string): string {
  const marker = '## Log de Estado'
  if (!body.includes(marker)) return `${body.trimEnd()}\n\n${marker}\n${line}`
  return `${body.trimEnd()}\n${line}`
}

function setObjetivo(body: string, desc: string): string {
  if (body.includes('## Objetivo')) {
    return body.replace(/(##\s*Objetivo\s*\n)([\s\S]*?)(\n##\s|$)/, (_m, h, _old, tail) => `${h}${desc}${tail}`)
  }
  return `## Objetivo\n${desc}\n\n${body.replace(/^\n+/, '')}`
}

function readCards(): Record<string, string>[] {
  return cardFiles().map(f => {
    const { fm, body } = splitFrontMatter(readFileSync(join(CARDS_DIR, f), 'utf8'))
    return { ...fm, desc: extractObjetivo(body), file: f }
  }).filter(c => c.id)
}

function nextId(): string {
  const max = readCards().reduce((a, c) => Math.max(a, Number(c.id) || 0), 0)
  return String(max + 1).padStart(3, '0')
}

export function getState() {
  ensure()
  const cards = readCards().map(c => ({
    id: c.id, slug: c.slug, title: c.title || c.slug,
    status: c.status || 'INBOX', risk: c.risk || 'low',
    repo: c.repo || '', updated: c.updated || '',
    desc: c.desc || '', cost_usd: c.cost_usd || '', tokens_total: c.tokens_total || '',
    preview_url: c.preview_url || '', pr_url: c.pr_url || '',
    shot: existsSync(join(CARDS_DIR, 'previews', String(c.id), 'preview.png')),
  }))
  return { repos: readRepos(), cards, statuses: STATUSES }
}

export function readRepos(): Record<string, string>[] {
  try { return JSON.parse(readFileSync(REPOS_FILE, 'utf8')) } catch { return [] }
}

export function addRepo(input: Record<string, string>) {
  ensure()
  const name = (input.name || '').trim()
  if (!name) return { error: 'name obrigatorio' }
  const repos = readRepos()
  if (repos.some(r => r.name === name)) return { error: 'repo ja existe' }
  repos.push({ name, url: input.url || '', branch: input.branch || 'main', runCmd: input.runCmd || '', added: isoNow() })
  writeFileSync(REPOS_FILE, JSON.stringify(repos, null, 2) + '\n')
  return { ok: true, repos }
}

function createCard(input: { title: string, risk?: string, repo?: string, desc?: string }) {
  const id = nextId()
  const slug = slugify(input.title)
  const fm: Record<string, string> = {
    id, slug, title: input.title,
    status: 'READY', risk: input.risk === 'high' ? 'high' : 'low',
    repo: input.repo || '', created: isoNow(), updated: isoNow(),
  }
  const objetivo = (input.desc && input.desc.trim()) ? input.desc.trim() : input.title
  const body = `## Objetivo\n${objetivo}\n\n## Log de Estado\n${isoNow()} CREATED status=READY (sprint)`
  writeFileSync(join(CARDS_DIR, `${id}-${slug}.md`), serializeCard(fm, Object.keys(fm), body) + '\n')
  return { ...fm }
}

export function createSprint(repo: string, features: { title: string, risk?: string, desc?: string }[]) {
  ensure()
  const created = (features || []).filter(f => f && f.title).map(f => createCard({ title: f.title, risk: f.risk, repo, desc: f.desc }))
  return { ok: true, created: created.length, cards: created }
}

export function transition(id: string, status: string, note?: string) {
  const f = findCardFile(id)
  if (!f) return null
  const p = join(CARDS_DIR, f)
  const { fm, order, body } = splitFrontMatter(readFileSync(p, 'utf8'))
  const from = fm.status || 'INBOX'
  fm.status = status
  fm.updated = isoNow()
  const nb = appendLog(body, `${isoNow()} ${from}->${status}${note ? ' ' + note : ''}`)
  writeFileSync(p, serializeCard(fm, order, nb) + '\n')
  return { ...fm, file: f }
}

export function editCard(id: string, fields: { title?: string, desc?: string, risk?: string }) {
  const f = findCardFile(id)
  if (!f) return null
  const p = join(CARDS_DIR, f)
  const { fm, order, body } = splitFrontMatter(readFileSync(p, 'utf8'))
  const keys = order.length ? order : Object.keys(fm)
  if (typeof fields.title === 'string' && fields.title.trim()) { fm.title = fields.title.trim(); if (!keys.includes('title')) keys.push('title') }
  if (fields.risk === 'high' || fields.risk === 'low') fm.risk = fields.risk
  let nb = body
  if (typeof fields.desc === 'string' && fields.desc.trim()) nb = setObjetivo(body, fields.desc.trim())
  let logLine = `${isoNow()} EDIT tarefa via painel`
  if (fm.status === 'EXECUTING') { fm.status = 'PAUSED'; logLine = `${isoNow()} EXECUTING->PAUSED editado (auto-pausa)` }
  fm.updated = isoNow()
  nb = appendLog(nb, logLine)
  writeFileSync(p, serializeCard(fm, keys, nb) + '\n')
  return { ...fm, file: f }
}

export function deleteCard(id: string): boolean {
  const f = findCardFile(id)
  if (!f) return false
  rmSync(join(CARDS_DIR, f))
  const prev = join(CARDS_DIR, 'previews', String(id))
  if (existsSync(prev)) rmSync(prev, { recursive: true, force: true })
  return true
}

export function previewFile(id: string): string | null {
  const p = join(CARDS_DIR, 'previews', String(id).padStart(3, '0'), 'preview.png')
  return existsSync(p) ? p : null
}

export function getRuns() {
  const dir = join(CARDS_DIR, 'runs')
  if (!existsSync(dir)) return []
  const titleById: Record<string, string> = {}
  for (const c of readCards()) titleById[c.id] = c.title || c.slug || ''
  const out = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    try {
      const r = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      return { ...r, title: titleById[r.id] || ('#' + r.id) }
    } catch { return null }
  }).filter(Boolean) as Record<string, unknown>[]
  out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
  return out
}
