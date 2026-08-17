import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ImplementResult } from '../lib/card'
import type { ExecuteDeps } from '../lib/runner/execute'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-execcost-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
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

const IMPLEMENT_RESULT: ImplementResult = {
  ok: true,
  resultText: 'mudou algo',
  fullText: 'mudou algo',
  cost: '0.0500',
  usage: { tokens_in: 10, tokens_out: 20, tokens_cache_create: 0, tokens_cache_read: 0 },
}

const { createCard, readCard } = await import('../lib/runner/card-store')
const { handleExecute } = await import('../lib/runner/execute')

const agente: ExecuteDeps = {
  implement: (): Promise<ImplementResult> => Promise.resolve(IMPLEMENT_RESULT),
  verifyVisual: (): Promise<never> => Promise.reject(new Error('nao deveria chamar verifyVisual')),
}

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

let seq = 0

function worktreeParaTeste(): string {
  return join(BASE, `wt-${++seq}`)
}

function cardComCustoPrevio(): string {
  return createCard({
    title: 'ajuste no rodape',
    status: 'EXECUTING',
    repo: 'org/repo',
    surface: 'none',
    clarified: 'true',
    worktree: worktreeParaTeste(),
    cost_usd: '1.2345',
    tokens_total: '500',
  }, '## Objetivo\najustar o rodape\n')
}

test('REGRESSAO: custo e tokens ACUMULAM sobre o que ja estava no card, nao sobrescrevem', async () => {
  const id = cardComCustoPrevio()
  await handleExecute(id, agente)
  const card = readCard(id)
  expect(card?.fm.status).toBe('PREVIEW_OK')
  expect(card?.fm.cost_usd).toBe('1.2845')
  expect(card?.fm.tokens_total).toBe('530')
})

test('card sem custo previo comeca a contar do zero (nao gera NaN)', async () => {
  const id = createCard({
    title: 'outra tarefa',
    status: 'EXECUTING',
    repo: 'org/repo',
    surface: 'none',
    clarified: 'true',
    worktree: worktreeParaTeste(),
  }, '## Objetivo\noutra coisa\n')
  await handleExecute(id, agente)
  const card = readCard(id)
  expect(card?.fm.cost_usd).toBe('0.0500')
  expect(card?.fm.tokens_total).toBe('30')
})
