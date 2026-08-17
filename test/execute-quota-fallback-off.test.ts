import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ImplementResult } from '../lib/card'
import type { ExecuteDeps } from '../lib/runner/execute'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-quotalock-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
process.env.HICODE_IMPLEMENT_QUOTA_FALLBACK_PROVIDER = 'codex'
mkdirSync(process.env.HICODE_CARDS_DIR, { recursive: true })

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

const origem = join(BASE, 'origem.git')
const semente = join(BASE, 'semente')
const clone = join(BASE, 'clone')
mkdirSync(semente, { recursive: true })
execFileSync('git', ['init', '-q', '--bare', origem])
git(semente, ['init', '-q', '.'])
git(semente, ['config', 'user.email', 't@t'])
git(semente, ['config', 'user.name', 't'])
writeFileSync(join(semente, 'a.txt'), 'um\n')
git(semente, ['add', '-A'])
git(semente, ['commit', '-qm', 'primeiro'])
git(semente, ['branch', '-M', 'main'])
git(semente, ['remote', 'add', 'origin', origem])
git(semente, ['push', '-q', '-u', 'origin', 'main'])
execFileSync('git', ['--git-dir', origem, 'symbolic-ref', 'HEAD', 'refs/heads/main'])
execFileSync('git', ['clone', '-q', origem, clone])
git(clone, ['config', 'user.email', 't@t'])
git(clone, ['config', 'user.name', 't'])

process.env.HICODE_REPOS_FILE = join(BASE, 'repos.json')
writeFileSync(process.env.HICODE_REPOS_FILE, JSON.stringify([{ name: 'org/repo', path: clone, branch: 'main' }]))

let resultadoDoAgente: ImplementResult = { ok: false, reason: 'nao configurado', cost: '0', usage: { tokens_in: 0, tokens_out: 0, tokens_cache_create: 0, tokens_cache_read: 0 } }

const { createCard, readCard } = await import('../lib/runner/card-store')
const { handleExecute } = await import('../lib/runner/execute')
const { quotaFallbackLigado } = await import('../lib/runner/config')

const agente: ExecuteDeps = {
  implement: (): Promise<ImplementResult> => Promise.resolve(resultadoDoAgente),
  verifyVisual: (): Promise<never> => Promise.reject(new Error('nao deveria chamar verifyVisual')),
}

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

let seq = 0

function worktreeParaTeste(): string {
  return join(BASE, `wt-${++seq}`)
}

function cardExecutando(wt: string, titulo: string): string {
  return createCard({
    title: titulo,
    status: 'EXECUTING',
    repo: 'org/repo',
    surface: 'none',
    clarified: 'true',
    worktree: wt,
  }, '## Objetivo\nfazer algo\n')
}

test('pre-condicao: HICODE_QUOTA_FALLBACK nao foi ligado neste arquivo (comportamento padrao)', () => {
  expect(quotaFallbackLigado()).toBe(false)
})

test('DECISAO DE PRODUTO: cota esgotada sem HICODE_QUOTA_FALLBACK=on para o card mesmo com um provedor de fallback configurado — nunca troca de provedor sozinho', async () => {
  resultadoDoAgente = { ok: false, reason: 'cota', cost: '0.0100', usage: { tokens_in: 1, tokens_out: 1, tokens_cache_create: 0, tokens_cache_read: 0 }, failureClass: 'quota', failureReason: 'cota do provedor esgotada', provider: 'claude' }
  const wt = worktreeParaTeste()
  const id = cardExecutando(wt, 'tarefa que estoura cota sem a chave mestra ligada')

  await handleExecute(id, agente)

  const card = readCard(id)
  expect(card?.fm.status).toBe('HALTED')
  expect(card?.fm.provider_override_implement).toBeUndefined()
  expect(card?.body).toContain('sem troca automatica de provedor')
  expect(existsSync(wt)).toBe(false)
})
