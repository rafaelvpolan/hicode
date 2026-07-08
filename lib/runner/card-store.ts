import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { splitFrontMatter, serializeCard, appendLog, isoNow } from '../card'
import type { Card, Fields } from '../card'
import { CARDS_DIR, REPOS_FILE, ROOT } from './config'

interface RepoConfig {
  name: string
  path?: string
  branch?: string
}

export function cardFiles(): string[] {
  return existsSync(CARDS_DIR) ? readdirSync(CARDS_DIR).filter(f => f.endsWith('.md')) : []
}

export function findCardFile(id: string): string | null {
  return cardFiles().find(f => f.startsWith(`${id}-`)) || null
}

export function readCard(id: string): Card | null {
  const f = findCardFile(id)
  if (!f) return null
  return { ...splitFrontMatter(readFileSync(join(CARDS_DIR, f), 'utf8')), file: f }
}

export function patchCard(id: string, fields: Fields, logLine?: string): void {
  const c = readCard(id)
  if (!c) return
  const { fm, order, body } = c
  for (const [k, v] of Object.entries(fields)) {
    fm[k] = v
    if (!order.includes(k)) order.push(k)
  }
  fm.updated = isoNow()
  const nb = logLine ? appendLog(body, logLine) : body
  writeFileSync(join(CARDS_DIR, c.file), serializeCard(fm, order, nb) + '\n')
}

export function cardsByStatus(status: string): Array<Fields & { file: string }> {
  return allCards().filter(c => c.status === status)
}

export function allCards(): Array<Fields & { file: string }> {
  return cardFiles()
    .map((f): Fields & { file: string } => ({ ...splitFrontMatter(readFileSync(join(CARDS_DIR, f), 'utf8')).fm, file: f }))
    .filter(c => c.id)
}

export function nextId(): string {
  const max = allCards().reduce((a, c) => Math.max(a, Number(c.id) || 0), 0)
  return String(max + 1).padStart(3, '0')
}

function slugify(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tarefa'
}

export function createCard(fields: Fields, body: string): string {
  const id = nextId()
  const slug = fields.slug || slugify(fields.title || '')
  const fm: Fields = { id, slug, status: 'READY', ...fields, updated: isoNow() }
  const order = Object.keys(fm)
  writeFileSync(join(CARDS_DIR, `${id}-${slug}.md`), serializeCard(fm, order, body) + '\n')
  return id
}

function loadRepos(): RepoConfig[] {
  try {
    return JSON.parse(readFileSync(REPOS_FILE, 'utf8')) as RepoConfig[]
  } catch {
    return []
  }
}

export function repoPath(repoName: string): string {
  const r = loadRepos().find(x => x.name === repoName)
  if (r && r.path) return r.path
  return join(dirname(ROOT), basename(repoName || ''))
}

export function repoBase(repoName: string): string {
  const r = loadRepos().find(x => x.name === repoName)
  if (r && r.branch) return r.branch
  return 'main'
}
