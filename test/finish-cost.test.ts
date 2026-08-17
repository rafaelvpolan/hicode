import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { GateResult } from '../lib/runner/codefox-gate'
import type { ImplementResult } from '../lib/card'
import type { ExecuteDeps } from '../lib/runner/execute'
import type { FinishDeps } from '../lib/runner/finish'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-finishcost-'))
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

let implementCalls = 0

const FALHA: ImplementResult = { ok: false, reason: 'falha simulada (transiente)', cost: '0.1000', usage: { tokens_in: 40, tokens_out: 60, tokens_cache_create: 0, tokens_cache_read: 0 } }
const SUCESSO: ImplementResult = { ok: true, resultText: 'mudou algo', fullText: 'mudou algo', cost: '0.2500', usage: { tokens_in: 70, tokens_out: 130, tokens_cache_create: 0, tokens_cache_read: 0 } }

const GATE_BLOCKED: GateResult = { ok: true, verdict: 'BLOCKED', reason: 'defeito real encontrado pelo crivo', questions: [], cost: 0.05, costMeasured: true, tokens: 500 }

const { createCard, readCard, patchCard } = await import('../lib/runner/card-store')
const { handleExecute } = await import('../lib/runner/execute')
const { handleFinish } = await import('../lib/runner/finish')

const agenteExecute: ExecuteDeps = {
  implement: (): Promise<ImplementResult> => {
    implementCalls++
    return Promise.resolve(implementCalls === 1 ? FALHA : SUCESSO)
  },
  verifyVisual: (): Promise<never> => Promise.reject(new Error('nao deveria chamar verifyVisual')),
}

const agenteFinish: FinishDeps = {
  runStep: (): never => { throw new Error('nao deveria chamar runStep — steps: nada nao roda nenhum passo') },
  runCodefoxGate: (): Promise<GateResult> => Promise.resolve(GATE_BLOCKED),
}

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

let seq = 0

function worktreeParaTeste(): string {
  return join(BASE, `wt-${++seq}`)
}

test('REGRESSAO: custo do card NUNCA decresce ao longo de execute->halt->resume->execute->finish(halt)', async () => {
  const wt = worktreeParaTeste()
  const id = createCard({
    title: 'ajuste no rodape',
    status: 'EXECUTING',
    repo: 'org/repo',
    surface: 'none',
    clarified: 'true',
    steps: 'nada',
    worktree: wt,
  }, '## Objetivo\najustar o rodape\n')

  await handleExecute(id, agenteExecute)
  const apos1aFalha = readCard(id)
  expect(apos1aFalha?.fm.status).toBe('HALTED')
  expect(apos1aFalha?.fm.cost_usd).toBe('0.1000')
  expect(apos1aFalha?.fm.tokens_total).toBe('100')

  patchCard(id, { status: 'EXECUTING' }, 'retomado pelo humano (teste)')
  await handleExecute(id, agenteExecute)
  const apos2aExecucao = readCard(id)
  expect(apos2aExecucao?.fm.status).toBe('PREVIEW_OK')
  expect(apos2aExecucao?.fm.cost_usd).toBe('0.3500')
  expect(apos2aExecucao?.fm.tokens_total).toBe('300')
  expect(parseFloat(apos2aExecucao?.fm.cost_usd ?? '0')).toBeGreaterThanOrEqual(parseFloat(apos1aFalha?.fm.cost_usd ?? '0'))

  await handleFinish(id, agenteFinish)
  const apos3oGateBloqueado = readCard(id)
  expect(apos3oGateBloqueado?.fm.status).toBe('HALTED')
  expect(apos3oGateBloqueado?.fm.cost_usd).toBe('0.4000')
  expect(apos3oGateBloqueado?.fm.tokens_total).toBe('800')
  expect(parseFloat(apos3oGateBloqueado?.fm.cost_usd ?? '0')).toBeGreaterThanOrEqual(parseFloat(apos2aExecucao?.fm.cost_usd ?? '0'))
  expect(existsSync(wt)).toBe(true)
})

test('REGRESSAO card com PR ja aberto nao tenta criar PR de novo', async () => {
  const { pularCriacaoDePr } = await import('../lib/runner/finish-pr')
  expect(pularCriacaoDePr('https://github.com/o/r/pull/20')).toBe(true)
  expect(pularCriacaoDePr('')).toBe(false)
  expect(pularCriacaoDePr('   ')).toBe(false)
})
