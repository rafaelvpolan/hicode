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

  const branch = card.branch || ''
  const repoName = card.repo || ''
  const wt = card.worktree || ''
  const repo = readRepos().find(r => r.name === repoName)
  const base = repo?.branch || 'main'
  const target = repoLocalPath(repoName)
  const hasWt = !!wt && existsSync(wt)
  const diffCwd = hasWt ? wt : target
  const diffRange = hasWt ? `origin/${base}...HEAD` : `origin/${base}...origin/${branch}`

  const status = await statusFor(diffCwd, diffRange, path)

  const beforeResult = await execGit(diffCwd, ['show', `origin/${base}:${path}`])
  const before = beforeResult.ok ? beforeResult.stdout : ''

  let after = ''
  if (hasWt && existsSync(join(wt, path))) {
    after = readFileSync(join(wt, path), 'utf8')
  } else {
    const afterResult = await execGit(target, ['show', `origin/${branch}:${path}`])
    after = afterResult.ok ? afterResult.stdout : ''
  }

  return { path, status, before: truncate(before), after: truncate(after) }
})
