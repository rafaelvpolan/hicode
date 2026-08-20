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

const RE_NOME_SEGURO = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/?$/
const RE_BRANCH_SEGURA = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

export function nomeSeguro(name: string): boolean {
  if (name.includes('..') || name.startsWith('/')) return false
  return RE_NOME_SEGURO.test(name)
}

export function branchSegura(branch: string): boolean {
  return RE_BRANCH_SEGURA.test(branch) && !branch.includes('..')
}

export function addRepo(input: AddRepoInput): AddRepoResult {
  ensure()
  const name = (input.name || '').trim()
  if (!name) return { error: 'name obrigatorio' }
  if (!nomeSeguro(name)) return { error: 'name invalido — use "repo", "owner/repo" ou um caminho de segmentos (letras, numeros, ".", "_", "-"), sem ".." nem barra inicial' }
  const branch = (input.branch || 'main').trim()
  if (!branchSegura(branch)) return { error: `branch invalida: "${branch}"` }
  const repos = readRepos()
  if (repos.some((r) => r.name === name)) return { error: 'repo ja existe' }
  repos.push({ name, url: input.url || '', branch, runCmd: input.runCmd || '', added: isoNow() })
  writeFileSync(REPOS_FILE, JSON.stringify(repos, null, 2) + '\n')
  return { ok: true, repos }
}
