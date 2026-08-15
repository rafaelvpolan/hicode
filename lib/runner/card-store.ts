import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { splitFrontMatter, serializeCard, appendLog, isoNow } from '../card'
import type { Card, Fields } from '../card'
import { cardsDir, reposFile, ROOT } from './config'
import { withFileLock, writeFileAtomic } from './file-lock'
import { memoArquivo } from '../core/cache'

interface RepoConfig {
  name: string
  path?: string
  branch?: string
}

export function cardFiles(): string[] {
  return existsSync(cardsDir()) ? readdirSync(cardsDir()).filter(f => f.endsWith('.md')) : []
}

export function normalizeId(id: string): string {
  const bruto = String(id ?? '').trim()
  if (!/^\d+$/.test(bruto)) return bruto
  return String(Number(bruto)).padStart(3, '0')
}

export function findCardFile(id: string): string | null {
  const alvo = normalizeId(id)
  return cardFiles().find(f => f.startsWith(`${alvo}-`)) || null
}

export function readCard(id: string): Card | null {
  const f = findCardFile(id)
  if (!f) return null
  return { ...splitFrontMatter(readFileSync(join(cardsDir(), f), 'utf8')), file: f }
}

export interface CardPatch {
  fields?: Fields | ((fm: Fields) => Fields)
  body?: (body: string, fm: Fields) => string
  log?: string | ((fm: Fields) => string)
}

export function updateCard(id: string, patch: CardPatch): Fields | null {
  const name = findCardFile(id)
  if (!name) return null
  const file = join(cardsDir(), name)
  return withFileLock(file, () => {
    const { fm, order, body } = splitFrontMatter(readFileSync(file, 'utf8'))
    const before: Fields = { ...fm }
    const resolvedFields = typeof patch.fields === 'function' ? patch.fields(before) : (patch.fields ?? {})
    for (const [k, v] of Object.entries(resolvedFields)) {
      fm[k] = v
      if (!order.includes(k)) order.push(k)
    }
    fm.updated = isoNow()
    let nb = patch.body ? patch.body(body, before) : body
    const line = typeof patch.log === 'function' ? patch.log(before) : patch.log
    if (line) nb = appendLog(nb, line)
    writeFileAtomic(file, serializeCard(fm, order, nb) + '\n')
    return { ...fm, file: name }
  })
}

export function patchCard(id: string, fields: Fields, logLine?: string): void {
  updateCard(id, { fields, log: logLine })
}

export function patchCardWith(id: string, compute: (fm: Fields) => Fields, logLine?: string | ((fm: Fields) => string)): Fields | null {
  return updateCard(id, { fields: compute, log: logLine })
}

export function cardsByStatus(status: string): Array<Fields & { file: string }> {
  return allCards().filter(c => c.status === status)
}

const parseCardFile = memoArquivo(
  (caminho: string): string => caminho,
  (caminho: string): Fields & { file: string } => ({ ...splitFrontMatter(readFileSync(caminho, 'utf8')).fm, file: basename(caminho) }),
)

export function allCards(): Array<Fields & { file: string }> {
  return cardFiles()
    .map(f => parseCardFile(join(cardsDir(), f)))
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
  writeFileSync(join(cardsDir(), `${id}-${slug}.md`), serializeCard(fm, order, body) + '\n')
  return id
}

function loadRepos(): RepoConfig[] {
  try {
    return JSON.parse(readFileSync(reposFile(), 'utf8')) as RepoConfig[]
  } catch {
    return []
  }
}

export function listRepos(): RepoConfig[] {
  return loadRepos()
}

export function repoRegistered(repoName: string): boolean {
  return loadRepos().some(r => r.name === repoName)
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
