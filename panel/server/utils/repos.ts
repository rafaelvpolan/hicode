import { readFileSync, writeFileSync } from 'node:fs'
import type { RepoView } from '#shared/types'
import { ensure, isoNow, REPOS_FILE } from './card-io'

export function readRepos(): RepoView[] {
  try { return JSON.parse(readFileSync(REPOS_FILE, 'utf8')) as RepoView[] } catch { return [] }
}

export interface AddRepoInput {
  name?: string
  url?: string
  branch?: string
  runCmd?: string
}

export interface AddRepoResult {
  ok?: true
  error?: string
  repos?: RepoView[]
}

export function addRepo(input: AddRepoInput): AddRepoResult {
  ensure()
  const name = (input.name || '').trim()
  if (!name) return { error: 'name obrigatorio' }
  const repos = readRepos()
  if (repos.some((r) => r.name === name)) return { error: 'repo ja existe' }
  repos.push({ name, url: input.url || '', branch: input.branch || 'main', runCmd: input.runCmd || '', added: isoNow() })
  writeFileSync(REPOS_FILE, JSON.stringify(repos, null, 2) + '\n')
  return { ok: true, repos }
}
