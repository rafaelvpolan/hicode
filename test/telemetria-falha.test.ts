import { beforeEach, test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ImplementResult, Run } from '../lib/card'
import type { ExecuteDeps } from '../lib/runner/execute'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-telemfalha-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
process.env.HICODE_COTA_TTL_MS = '0'
delete process.env.HICODE_QUOTA_FALLBACK
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

const { createCard, readCard, patchCard } = await import('../lib/runner/card-store')
const { handleExecute } = await import('../lib/runner/execute')
const { classifyFailure } = await import('../lib/ai/failure')
const { readFailureAttempts } = await import('../lib/runner/attempts')
const { writeRun, MOTIVO_SEM_CLASSIFICACAO } = await import('../lib/runner/runs')
const { applyFailurePolicy } = await import('../lib/runner/failure-policy')
const { loteDesde } = await import('../lib/core/cota-runs')
const { lerCota } = await import('../lib/core/cota')

let resultadoDoAgente: ImplementResult = { ok: false, reason: 'nao configurado', cost: '0' }

const agente: ExecuteDeps = {
  implement: (): Promise<ImplementResult> => Promise.resolve(resultadoDoAgente),
  verifyVisual: (): Promise<never> => Promise.reject(new Error('nao deveria chamar verifyVisual')),
}

beforeEach(() => { process.env.HICODE_WAITING_MAX_ATTEMPTS = '3' })

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

let seq = 0

function cardExecutando(titulo: string): string {
  return createCard({
    title: titulo,
    status: 'EXECUTING',
    repo: 'org/repo',
    surface: 'none',
    clarified: 'true',
    worktree: join(BASE, `wt-${++seq}`),
  }, '## Objetivo\nfazer algo\n')
}

function saidaDoProvedor(provider: 'claude' | 'codex', saidaCrua: string): ImplementResult {
  const cls = classifyFailure(provider, { timedOut: false, detail: saidaCrua, text: '' })
  return {
    ok: false,
    reason: saidaCrua,
    cost: '0.0100',
    provider,
    model: 'modelo-de-teste',
    usage: { tokens_in: 5, tokens_out: 5, tokens_cache_create: 0, tokens_cache_read: 0 },
    failureClass: cls.failureClass,
    failureReason: cls.reason,
  }
}

function arquivosDeRun(id: string): string[] {
  return readdirSync(join(BASE, 'cards', 'runs')).filter(f => f.startsWith(`${id}-`) && f.endsWith('.json')).sort()
}

function runGravado(id: string): Run {
  const nomes = arquivosDeRun(id)
  const ultimo = nomes[nomes.length - 1] ?? ''
  return JSON.parse(readFileSync(join(BASE, 'cards', 'runs', ultimo), 'utf8')) as Run
}

test('falha de rede do provedor grava classe transient no run em disco', async () => {
  resultadoDoAgente = saidaDoProvedor('claude', 'Error: connect ECONNRESET 160.79.104.10:443')
  const id = cardExecutando('tarefa que bate em rede caida')
  await handleExecute(id, agente)
  const run = runGravado(id)
  expect(run.ok).toBe(false)
  expect(run.failure_class).toBe('transient')
  expect(run.failure_reason).toBe('rede indisponivel')
  expect(run.provider).toBe('claude')
  expect(readCard(id)?.fm.status).toBe('WAITING')
})

test('cota esgotada grava classe quota no run e no card', async () => {
  resultadoDoAgente = saidaDoProvedor('claude', 'Claude AI usage limit reached. Your limit will reset at 5pm.')
  const id = cardExecutando('tarefa que estoura a cota')
  await handleExecute(id, agente)
  const run = runGravado(id)
  expect(run.failure_class).toBe('quota')
  expect(run.failure_reason).toBe('limite de uso da assinatura Claude atingido')
  expect(readCard(id)?.fm.halt_class).toBe('quota')
})

test('binario ausente grava classe terminal no run', async () => {
  resultadoDoAgente = saidaDoProvedor('codex', 'Error: spawn codex ENOENT')
  const id = cardExecutando('tarefa com provedor nao instalado')
  await handleExecute(id, agente)
  const run = runGravado(id)
  expect(run.failure_class).toBe('terminal')
  expect(run.failure_reason).toBe('provedor nao instalado (binario nao encontrado)')
  expect(readCard(id)?.fm.status).toBe('HALTED')
})

test('run que deu certo grava classe vazia — nao "terminal" por acidente', async () => {
  resultadoDoAgente = {
    ok: true,
    resultText: 'mudanca aplicada',
    cost: '0.2000',
    provider: 'claude',
    model: 'modelo-de-teste',
    usage: { tokens_in: 10, tokens_out: 10, tokens_cache_create: 0, tokens_cache_read: 0 },
  }
  const id = cardExecutando('tarefa que da certo')
  await handleExecute(id, agente)
  const run = runGravado(id)
  expect(run.ok).toBe(true)
  expect(run.failure_class).toBe('')
  expect(run.failure_reason).toBe('')
  expect(readFailureAttempts(id)).toEqual([])
})

test('REGRESSAO provedor que falha sem classificar grava terminal no run — o canal nunca fica vazio numa falha', async () => {
  resultadoDoAgente = { ok: false, reason: 'saida ilegivel do provedor', cost: '0.0100', provider: 'claude' }
  const id = cardExecutando('tarefa que falha sem classificacao')
  await handleExecute(id, agente)
  const run = runGravado(id)
  const card = readCard(id)
  expect(run.failure_class).toBe('terminal')
  expect(run.failure_reason).toBe(MOTIVO_SEM_CLASSIFICACAO)
  expect(card?.fm.halt_class).toBe('terminal')
  expect(card?.fm.halt_reason).toBe(MOTIVO_SEM_CLASSIFICACAO)
})

test('retentativa registra a classe de CADA tentativa, nao so a da ultima', async () => {
  resultadoDoAgente = saidaDoProvedor('claude', 'Error: connect ECONNRESET 160.79.104.10:443')
  const id = cardExecutando('tarefa que falha duas vezes por motivos diferentes')
  await handleExecute(id, agente)
  expect(readCard(id)?.fm.wait_attempts).toBe('1')

  patchCard(id, { status: 'EXECUTING' })
  resultadoDoAgente = saidaDoProvedor('claude', 'Claude AI usage limit reached. Your limit will reset at 5pm.')
  await handleExecute(id, agente)

  const tentativas = readFailureAttempts(id)
  expect(tentativas.map(t => t.attempt)).toEqual([1, 2])
  expect(tentativas.map(t => t.failureClass)).toEqual(['transient', 'quota'])
  expect(tentativas.map(t => t.outcome)).toEqual(['waiting', 'halt'])
  expect(tentativas.map(t => t.failureReason)).toEqual(['rede indisponivel', 'limite de uso da assinatura Claude atingido'])
  expect(tentativas.map(t => t.provider)).toEqual(['claude', 'claude'])
  expect(tentativas.map(t => t.fromStatus)).toEqual(['EXECUTING', 'EXECUTING'])
})

test('falha de provedor num step de polimento carimba o run que ja estava gravado como sucesso', () => {
  const id = createCard({ title: 'tarefa que quebra no polimento', status: 'TESTS_GREEN', repo: 'org/repo' }, '## Objetivo\nalgo\n')
  writeRun(id, { ok: true, cost: '0.5000', provider: 'claude', model: 'modelo-de-teste' })
  expect(runGravado(id).failure_class).toBe('')

  applyFailurePolicy({
    id,
    fromStatus: 'TESTS_GREEN',
    resumeStatus: 'PREVIEW_OK',
    provider: 'claude',
    failureClass: 'transient',
    failureReason: 'rede indisponivel',
    technicalDetail: 'ECONNRESET',
    resumeStep: 'testes',
  })

  const run = runGravado(id)
  expect(run.ok).toBe(false)
  expect(run.failure_class).toBe('transient')
  expect(run.failure_reason).toBe('rede indisponivel')
  expect(readFailureAttempts(id).map(t => t.fromStatus)).toEqual(['TESTS_GREEN'])
})

test('PONTA A PONTA o run gravado sobrevive a releitura por cota-runs com a classe intacta', async () => {
  resultadoDoAgente = saidaDoProvedor('claude', 'Claude AI usage limit reached. Your limit will reset at 5pm.')
  const id = cardExecutando('tarefa lida de volta pelo leitor de runs')
  await handleExecute(id, agente)

  const lote = loteDesde(Date.now() - 60_000)
  const registro = lote.registros.find(r => r.card === id)
  expect(registro?.ok).toBe(false)
  expect(registro?.classeDeFalha).toBe('quota')
  expect(registro?.motivoDaFalha).toBe('limite de uso da assinatura Claude atingido')
  expect(registro?.provedor).toBe('claude')
  expect(lote.registros.filter(r => r.card === id).map(r => r.classeDeFalha)).toEqual(['quota'])
})

test('REGRESSAO cota de um provedor nao e carimbada no registro de outro provedor', () => {
  const id = createCard({ title: 'polimento noutro provedor', status: 'TESTS_GREEN', repo: 'org/repo' }, '## Objetivo\nalgo\n')
  writeRun(id, { ok: true, cost: '0.5000', provider: 'claude', model: 'modelo-de-teste' })

  applyFailurePolicy({
    id,
    fromStatus: 'TESTS_GREEN',
    resumeStatus: 'PREVIEW_OK',
    provider: 'codex',
    failureClass: 'quota',
    failureReason: 'cota do codex esgotada',
    technicalDetail: 'usage limit',
  })

  const run = runGravado(id)
  expect(run.ok).toBe(false)
  expect(run.provider).toBe('claude')
  expect(run.failure_class).toBe('')
  expect(run.failure_reason).toBe('cota do codex esgotada (provedor codex)')

  expect(lerCota().provedores.flatMap(p => p.cardsNoLimite)).not.toContain(id)
  expect(readCard(id)?.fm.halt_provider).toBe('codex')
  expect(readCard(id)?.fm.halt_class).toBe('quota')
  expect(readFailureAttempts(id).map(t => `${t.provider}:${t.failureClass}`)).toEqual(['codex:quota'])
})

test('provedor conhecido so no carimbo preenche o registro sem provedor', () => {
  const id = createCard({ title: 'run sem provedor', status: 'TESTS_GREEN', repo: 'org/repo' }, '## Objetivo\nalgo\n')
  writeRun(id, { ok: false, cost: '0.0100' })
  expect(runGravado(id).provider).toBe('')

  applyFailurePolicy({
    id,
    fromStatus: 'TESTS_GREEN',
    resumeStatus: 'PREVIEW_OK',
    provider: 'codex',
    failureClass: 'quota',
    failureReason: 'cota do codex esgotada',
    technicalDetail: 'usage limit',
  })

  expect(runGravado(id).failure_class).toBe('quota')
  expect(runGravado(id).failure_reason).toBe('cota do codex esgotada')
})
