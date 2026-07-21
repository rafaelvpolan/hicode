import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { CARDS_DIR } from './card-io'

export const MAX_REFS = 8

const REFS_DIR = join(CARDS_DIR, 'refs')

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

const EXT_BY_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_BY_EXT).map(([ext, mime]) => [mime, ext]),
)

function refsFile(id: string): string {
  return join(REFS_DIR, `${id}.json`)
}

function refsUploadDir(id: string): string {
  return join(REFS_DIR, id)
}

function ensureRefsDir(): void {
  if (!existsSync(REFS_DIR)) mkdirSync(REFS_DIR, { recursive: true })
}

function extFromFilename(filename: string): string {
  return extname(filename).replace('.', '').toLowerCase()
}

function nextUploadIndex(id: string): number {
  const dir = refsUploadDir(id)
  if (!existsSync(dir)) return 1
  const max = readdirSync(dir).reduce((acc, file) => {
    const match = file.match(/^upload-(\d+)\./)
    return match ? Math.max(acc, Number(match[1])) : acc
  }, 0)
  return max + 1
}

export function isRefUrl(source: string): boolean {
  return /^https?:\/\//i.test(source)
}

export function readRefs(id: string): string[] {
  const path = refsFile(id)
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as string[]
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function writeRefs(id: string, sources: string[]): string[] {
  ensureRefsDir()
  const deduped = [...new Set(sources.map((s) => s.trim()).filter(Boolean))].slice(0, MAX_REFS)
  writeFileSync(refsFile(id), `${JSON.stringify(deduped, null, 2)}\n`)
  return deduped
}

export function addRefs(id: string, sources: string[]): string[] {
  return writeRefs(id, [...readRefs(id), ...sources])
}

export function removeRefAt(id: string, index: number): string[] {
  const current = readRefs(id)
  if (index < 0 || index >= current.length) return current
  current.splice(index, 1)
  return writeRefs(id, current)
}

export function refAt(id: string, index: number): string | null {
  const current = readRefs(id)
  return current[index] ?? null
}

export function saveRefUpload(id: string, filename: string, mimeType: string, data: Buffer): string {
  const dir = refsUploadDir(id)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const ext = EXT_BY_MIME[mimeType] || extFromFilename(filename) || 'png'
  const index = nextUploadIndex(id)
  const path = join(dir, `upload-${index}.${ext}`)
  writeFileSync(path, data)
  return path
}

export function mimeForRefPath(path: string): string {
  return MIME_BY_EXT[extFromFilename(path)] || 'application/octet-stream'
}

export function isRefUploadPath(id: string, path: string): boolean {
  const dir = resolve(refsUploadDir(id))
  return resolve(path).startsWith(`${dir}/`)
}
