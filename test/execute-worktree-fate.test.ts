import { beforeEach, test, expect, afterAll, mock } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ImplementResult } from '../lib/card'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-wtfate-'))
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

const realAgent = await import('../lib/runner/agent')
mock.module('../lib/runner/agent', () => ({
  ...realAgent,
  implement: (): Promise<ImplementResult> => Promise.resolve(resultadoDoAgente),
  verifyVisual: (): Promise<never> => Promise.reject(new Error('nao deveria chamar verifyVisual')),
  runStep: (): never => { throw new Error('nao deveria chamar runStep') },
}))

const { createCard, readCard, patchCard } = await import('../lib/runner/card-store')
const { handleExecute } = await import('../lib/runner/execute')
const { maxWaitingAttempts } = await import('../lib/runner/config')

beforeEach(() => { process.env.HICODE_WAITING_MAX_ATTEMPTS = '2' })

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

function falha(over: Partial<ImplementResult>): ImplementResult {
  return { ok: false, reason: 'falha', cost: '0.0100', usage: { tokens_in: 5, tokens_out: 5, tokens_cache_create: 0, tokens_cache_read: 0 }, ...over }
}

test('REGRESSAO: falha terminal (classificacao desconhecida) descarta o worktree (nada a inspecionar)', async () => {
  resultadoDoAgente = falha({ reason: 'erro comum, nao e timeout' })
  const wt = worktreeParaTeste()
  const id = cardExecutando(wt, 'tarefa que falha sem timeout')
  expect(existsSync(wt)).toBe(false)
  await handleExecute(id)
  expect(readCard(id)?.fm.status).toBe('HALTED')
  expect(existsSync(wt)).toBe(false)
})

test('REGRESSAO: falha POR TIMEOUT e transiente — vira WAITING (nao HALT) e mantem o worktree para retomada automatica', async () => {
  resultadoDoAgente = falha({ reason: 'excedeu o tempo limite', timedOut: true, cost: '0.0200', failureClass: 'transient', failureReason: 'timeout — provedor nao respondeu a tempo' })
  const wt = worktreeParaTeste()
  const id = cardExecutando(wt, 'tarefa que estoura o tempo')
  await handleExecute(id)
  const card = readCard(id)
  expect(card?.fm.status).toBe('WAITING')
  expect(card?.fm.wait_resume_status).toBe('EXECUTING')
  expect(card?.fm.wait_attempts).toBe('1')
  expect(existsSync(wt)).toBe(true)
})

test('transiente que esgota as tentativas finalmente HALTa mas mantem o worktree para inspecao', async () => {
  resultadoDoAgente = falha({ timedOut: true, failureClass: 'transient', failureReason: 'timeout' })
  const wt = worktreeParaTeste()
  const id = cardExecutando(wt, 'tarefa sempre transiente')
  patchCard(id, { wait_attempts: String(maxWaitingAttempts()) })
  await handleExecute(id)
  const card = readCard(id)
  expect(card?.fm.status).toBe('HALTED')
  expect(card?.body).toContain(`esgotou ${maxWaitingAttempts()} tentativas de espera`)
  expect(existsSync(wt)).toBe(true)
})

test('cota esgotada (sem fallback aplicavel, ja no provedor de fallback) para o card e descarta o worktree', async () => {
  resultadoDoAgente = { ok: false, reason: 'cota', cost: '0.0100', usage: { tokens_in: 1, tokens_out: 1, tokens_cache_create: 0, tokens_cache_read: 0 }, failureClass: 'quota', failureReason: 'cota do provedor esgotada', provider: 'codex' }
  const wt = worktreeParaTeste()
  const id = cardExecutando(wt, 'tarefa que estoura a cota ja no fallback')
  await handleExecute(id)
  const card = readCard(id)
  expect(card?.fm.status).toBe('HALTED')
  expect(card?.body).toContain('cota do provedor codex esgotada')
  expect(existsSync(wt)).toBe(false)
})

test('cota esgotada com fallback configurado (HICODE_QUOTA_FALLBACK=on): troca de provedor em vez de parar', async () => {
  process.env.HICODE_QUOTA_FALLBACK = 'on'
  try {
    resultadoDoAgente = { ok: false, reason: 'cota', cost: '0.0100', usage: { tokens_in: 1, tokens_out: 1, tokens_cache_create: 0, tokens_cache_read: 0 }, failureClass: 'quota', failureReason: 'cota do provedor esgotada', provider: 'claude' }
    const wt = worktreeParaTeste()
    const id = cardExecutando(wt, 'tarefa que estoura a cota no provedor padrao')
    await handleExecute(id)
    const card = readCard(id)
    expect(card?.fm.status).toBe('EXECUTING')
    expect(card?.fm.provider_override_implement).toBe('codex')
    expect(card?.body).toContain('trocando para codex')
    expect(existsSync(wt)).toBe(true)
  } finally {
    delete process.env.HICODE_QUOTA_FALLBACK
  }
})
