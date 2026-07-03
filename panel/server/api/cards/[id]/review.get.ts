import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import type { CardStatus, ReviewChangedFile, ReviewResponse } from '#shared/types'

interface ExecResult {
  ok: boolean
  stdout: string
}

function execGit(cwd: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 1 << 24, timeout: 30000 }, (err, stdout) => {
      resolve({ ok: !err, stdout: String(stdout ?? '') })
    })
  })
}

const MAX_FILES = 200

function phaseFromSubject(subject: string): string {
  if (/^feat:|^perf|^#/.test(subject)) return 'Execução'
  if (subject.includes('qualidade Nexus')) return 'Qualidade'
  if (subject.includes('integra')) return 'Integração'
  if (subject.includes('correção humana')) return 'Correção'
  return 'Alteração'
}

async function subjectFor(cwd: string, range: string, path: string): Promise<string> {
  const r = await execGit(cwd, ['log', '-1', '--format=%s', range, '--', path])
  return r.stdout.trim()
}

function parseNameStatus(stdout: string): Array<{ status: string; path: string }> {
  return stdout.split('\n').filter(Boolean).slice(0, MAX_FILES).map((line) => {
    const cols = line.split('\t')
    return { status: cols[0] ?? '', path: cols[cols.length - 1] ?? '' }
  })
}

function emptyReview(id: string, error: string): ReviewResponse {
  return {
    id,
    status: 'INBOX',
    title: '',
    desc: '',
    branch: '',
    pr_url: '',
    source: 'none',
    preview: { shot: false, url: '', running: false },
    verdict: '',
    reason: '',
    questions: [],
    files: [],
    correcting: false,
    canCorrect: false,
    error,
  }
}

function parseQuestions(raw: string): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === 'string') : []
  } catch {
    return []
  }
}

async function ignoredPaths(cwd: string, paths: string[]): Promise<Set<string>> {
  if (!paths.length) return new Set()
  const r = await execGit(cwd, ['check-ignore', '--no-index', '--', ...paths])
  return new Set(r.stdout.split('\n').map(s => s.trim()).filter(Boolean))
}

async function withoutIgnored(cwd: string, files: ReviewChangedFile[]): Promise<ReviewChangedFile[]> {
  const ignored = await ignoredPaths(cwd, files.map(f => f.path))
  return ignored.size ? files.filter(f => !ignored.has(f.path)) : files
}

async function changedFiles(cwd: string, range: string, diffRange: string): Promise<ReviewChangedFile[]> {
  const diff = await execGit(cwd, ['diff', '--name-status', diffRange])
  if (!diff.ok) return []
  const entries = parseNameStatus(diff.stdout)
  const files: ReviewChangedFile[] = []
  for (const entry of entries) {
    const subject = await subjectFor(cwd, range, entry.path)
    files.push({ path: entry.path, status: entry.status, phase: phaseFromSubject(subject) })
  }
  return files
}

export default defineEventHandler(async (event): Promise<ReviewResponse> => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const card = readCards().find(c => c.id === id)
  if (!card) return emptyReview(id, 'card não encontrado')

  const branch = card.branch || ''
  const repoName = card.repo || ''
  const wt = card.worktree || ''
  const prUrl = card.pr_url || ''
  const repo = readRepos().find(r => r.name === repoName)
  const base = repo?.branch || 'main'
  const target = repoLocalPath(repoName)

  const shot = existsSync(join(CARDS_DIR, 'previews', id, 'preview.png'))
  const previewUrl = card.preview_url || ''

  let source: ReviewResponse['source'] = 'none'
  let files: ReviewChangedFile[] = []

  if (wt && existsSync(join(wt, '.git'))) {
    source = 'wip'
    files = await withoutIgnored(wt, await changedFiles(wt, `origin/${base}..HEAD`, `origin/${base}...HEAD`))
  } else if (prUrl) {
    source = 'pr'
    files = await withoutIgnored(target, await prChangedFiles(prUrl))
  }

  return {
    id,
    status: (card.status || 'INBOX') as CardStatus,
    title: card.title || '',
    desc: card.desc || '',
    branch,
    pr_url: prUrl,
    source,
    preview: { shot, url: previewUrl, running: !!previewUrl },
    verdict: card.review_verdict || '',
    reason: card.review_reason || '',
    questions: parseQuestions(card.review_questions || ''),
    files,
    correcting: card.status === 'CORRECTING',
    canCorrect: source === 'wip' && card.status === 'PREVIEW',
  }
})
