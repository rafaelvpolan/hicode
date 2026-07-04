import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import type { FileDiffResponse } from '#shared/types'

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

const MAX_CHARS = 200000

function truncate(text: string): string {
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n\n[...truncado...]` : text
}

function isUnsafePath(path: string): boolean {
  return !path || path.includes('..') || path.startsWith('/') || path.includes('\0')
}

async function statusFor(cwd: string, diffRange: string, path: string): Promise<string> {
  const r = await execGit(cwd, ['diff', '--name-status', diffRange, '--', path])
  if (!r.ok) return ''
  const line = r.stdout.split('\n').find(Boolean) || ''
  return line.split('\t')[0] || ''
}

export default defineEventHandler(async (event): Promise<FileDiffResponse> => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const path = String(getQuery(event).path || '')

  if (isUnsafePath(path)) return { path, status: '', before: '', after: '', error: 'path inválido' }

  const card = readCards().find(c => c.id === id)
  if (!card) return { path, status: '', before: '', after: '', error: 'card não encontrado' }

  const repoName = card.repo || ''
  const wt = card.worktree || ''
  const repo = readRepos().find(r => r.name === repoName)
  const base = repo?.branch || 'main'
  const hasWt = !!wt && existsSync(join(wt, '.git'))

  if (!hasWt) {
    if (!card.pr_url) return { path, status: '', before: '', after: '', error: 'sem worktree nem PR' }
    const c = await prFileContent(card.pr_url, path)
    return { path, status: c.status, before: truncate(c.before), after: truncate(c.after) }
  }

  const status = await statusFor(wt, `origin/${base}...HEAD`, path)
  const beforeResult = await execGit(wt, ['show', `origin/${base}:${path}`])
  const before = beforeResult.ok ? beforeResult.stdout : ''
  const after = existsSync(join(wt, path)) ? readFileSync(join(wt, path), 'utf8') : ''

  return { path, status, before: truncate(before), after: truncate(after) }
})
