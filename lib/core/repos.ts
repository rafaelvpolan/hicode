import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, dirname, resolve } from 'node:path'
import { join } from 'node:path'
import { ROOT, reposFile } from '../runner/config'
import { listRepos } from '../runner/card-store'
import { initHicodeHome } from '../runner/hicode-home'
import { syncContract } from '../contract/store'
import type { Contract } from '../contract/types'

export interface RepoEntry {
  name: string
  url: string
  path: string
  branch: string
  added: string
}

export interface AddInput {
  name: string
  path?: string
  branch?: string
  url?: string
}

export interface AddResult {
  ok: boolean
  error?: string
  repo?: RepoEntry
  provisioned?: string[]
  contract?: Contract
}

function git(dir: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

export function isGitRepo(dir: string): boolean {
  return existsSync(join(dir, '.git'))
}

export function detectRemote(dir: string): string {
  return git(dir, ['config', '--get', 'remote.origin.url'])
}

export function detectBranch(dir: string): string {
  const head = git(dir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (head) return head.replace(/^origin\//, '')
  return git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'main'
}

export function guessPath(name: string): string {
  return join(dirname(ROOT), basename(name || ''))
}

function persist(entries: RepoEntry[]): void {
  const f = reposFile()
  const dir = dirname(f)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(f, JSON.stringify(entries, null, 2) + '\n')
}

function current(): RepoEntry[] {
  const f = reposFile()
  if (!existsSync(f)) return []
  try {
    const parsed = JSON.parse(readFileSync(f, 'utf8')) as RepoEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function addRepo(input: AddInput, now: string): AddResult {
  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, error: 'informe o nome no formato owner/repo' }
  if (listRepos().some(r => r.name === name)) return { ok: false, error: `"${name}" ja esta registrado` }

  const path = resolve(input.path?.trim() || guessPath(name))
  if (!existsSync(path)) {
    return { ok: false, error: `clone nao encontrado em ${path} — clone primeiro, ou passe --path` }
  }
  if (!isGitRepo(path)) return { ok: false, error: `${path} existe mas nao e um repositorio git` }

  const repo: RepoEntry = {
    name,
    url: input.url?.trim() || detectRemote(path),
    path,
    branch: input.branch?.trim() || detectBranch(path),
    added: now,
  }
  persist([...current(), repo])
  return {
    ok: true,
    repo,
    provisioned: initHicodeHome(path),
    contract: syncContract(path, now).contract,
  }
}

export interface RemoveResult {
  ok: boolean
  error?: string
}

export function removeRepo(name: string): RemoveResult {
  const entries = current()
  const rest = entries.filter(r => r.name !== name)
  if (rest.length === entries.length) return { ok: false, error: `"${name}" nao esta registrado` }
  persist(rest)
  return { ok: true }
}

export interface RepoStatus extends RepoEntry {
  cloneOk: boolean
  gitOk: boolean
  contractOk: boolean
}

export function repoStatus(): RepoStatus[] {
  return current().map((r) => {
    const path = r.path || guessPath(r.name)
    return {
      ...r,
      path,
      cloneOk: existsSync(path),
      gitOk: isGitRepo(path),
      contractOk: existsSync(join(path, '.hii', 'contract.json')),
    }
  })
}
