import { execFile } from 'node:child_process'
import type { ReviewChangedFile } from '#shared/types'

interface GhResult {
  ok: boolean
  stdout: string
}

export interface PrRef {
  owner: string
  repo: string
  number: string
}

export interface PrFileContent {
  before: string
  after: string
  status: string
}

const MAX_FILES = 200
const MAX_CHARS = 200000

function runGh(args: string[]): Promise<GhResult> {
  return new Promise((resolve) => {
    execFile('gh', args, { maxBuffer: 1 << 24, timeout: 30000 }, (err, stdout) => {
      resolve({ ok: !err, stdout: String(stdout ?? '') })
    })
  })
}

export function parsePrUrl(url: string): PrRef | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!m) return null
  return { owner: m[1] ?? '', repo: m[2] ?? '', number: m[3] ?? '' }
}

function statusLetter(ghStatus: string): string {
  if (ghStatus === 'added') return 'A'
  if (ghStatus === 'removed') return 'D'
  if (ghStatus === 'renamed') return 'R'
  return 'M'
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export async function prChangedFiles(url: string): Promise<ReviewChangedFile[]> {
  const pr = parsePrUrl(url)
  if (!pr) return []
  const r = await runGh(['api', `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/files`, '--paginate', '--jq', '.[] | .status + "\t" + .filename'])
  if (!r.ok) return []
  return r.stdout.split('\n').filter(Boolean).slice(0, MAX_FILES).map((line) => {
    const cols = line.split('\t')
    return { path: cols[1] ?? '', status: statusLetter(cols[0] ?? ''), phase: `PR #${pr.number}` }
  })
}

async function blobAt(pr: PrRef, path: string, ref: string): Promise<string> {
  if (!ref) return ''
  const r = await runGh(['api', `repos/${pr.owner}/${pr.repo}/contents/${encodePath(path)}?ref=${ref}`, '--jq', '.content'])
  if (!r.ok) return ''
  const b64 = r.stdout.replace(/\s+/g, '')
  if (!b64) return ''
  const text = Buffer.from(b64, 'base64').toString('utf8')
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n\n[...truncado...]` : text
}

export async function prFileContent(url: string, path: string): Promise<PrFileContent> {
  const pr = parsePrUrl(url)
  if (!pr) return { before: '', after: '', status: '' }
  const meta = await runGh(['api', `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`, '--jq', '.head.sha + "\n" + .base.sha'])
  const parts = meta.ok ? meta.stdout.trim().split('\n') : []
  const headSha = parts[0] ?? ''
  const baseSha = parts[1] ?? ''
  if (!headSha || !baseSha) return { before: '', after: '', status: '' }
  const cmp = await runGh(['api', `repos/${pr.owner}/${pr.repo}/compare/${baseSha}...${headSha}`, '--jq', '.merge_base_commit.sha'])
  const mergeBase = cmp.ok && cmp.stdout.trim() ? cmp.stdout.trim() : baseSha
  const before = await blobAt(pr, path, mergeBase)
  const after = await blobAt(pr, path, headSha)
  const status = before && after ? 'M' : after ? 'A' : before ? 'D' : ''
  return { before, after, status }
}
