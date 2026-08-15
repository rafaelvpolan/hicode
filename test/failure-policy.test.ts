import { beforeEach, test, expect, afterAll } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-failpolicy-'))
process.env.HICODE_CARDS_DIR = CARDS

const { createCard, readCard } = await import('../lib/runner/card-store')
const { applyFailurePolicy, backoffMsFor } = await import('../lib/runner/failure-policy')

beforeEach(() => { process.env.HICODE_WAITING_MAX_ATTEMPTS = '3' })

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

function card(): string {
  return createCard({ title: 'algo', status: 'EXECUTING', repo: 'org/repo' }, '## Objetivo\nalgo\n')
}

test('backoff cresce e depois estabiliza no teto de 10min', () => {
  expect(backoffMsFor(1)).toBe(30_000)
  expect(backoffMsFor(2)).toBe(60_000)
  expect(backoffMsFor(3)).toBe(120_000)
  expect(backoffMsFor(4)).toBe(300_000)
  expect(backoffMsFor(5)).toBe(600_000)
  expect(backoffMsFor(6)).toBe(600_000)
  expect(backoffMsFor(50)).toBe(600_000)
})

test('falha transiente vira WAITING com motivo, tentativas e proxima tentativa visiveis no card', () => {
  const id = card()
  const outcome = applyFailurePolicy({
    id, fromStatus: 'EXECUTING', resumeStatus: 'EXECUTING', provider: 'claude',
    failureClass: 'transient', failureReason: 'rede indisponivel', technicalDetail: 'ECONNRESET',
  })
  expect(outcome).toBe('waiting')
  const c = readCard(id)
  expect(c?.fm.status).toBe('WAITING')
  expect(c?.fm.wait_attempts).toBe('1')
  expect(c?.fm.wait_reason).toBe('rede indisponivel')
  expect(c?.fm.wait_resume_status).toBe('EXECUTING')
  expect(c?.fm.wait_provider).toBe('claude')
  expect(Date.parse(c?.fm.wait_until ?? '')).toBeGreaterThan(Date.now())
  expect(c?.body).toContain('proxima tentativa as')
})

test('tentativas acumulam a partir do que ja estava no card (nao reinicia em 1 a cada chamada)', () => {
  const id = card()
  applyFailurePolicy({ id, fromStatus: 'EXECUTING', resumeStatus: 'EXECUTING', provider: 'claude', failureClass: 'transient', failureReason: 'x', technicalDetail: 'x' })
  applyFailurePolicy({ id, fromStatus: 'EXECUTING', resumeStatus: 'EXECUTING', provider: 'claude', failureClass: 'transient', failureReason: 'x', technicalDetail: 'x' })
  expect(readCard(id)?.fm.wait_attempts).toBe('2')
})

test('REGRESSAO: estourar o numero maximo de tentativas finalmente HALTa com diagnostico', () => {
  const id = card()
  for (let i = 0; i < 3; i++) {
    applyFailurePolicy({ id, fromStatus: 'EXECUTING', resumeStatus: 'EXECUTING', provider: 'claude', failureClass: 'transient', failureReason: 'rede indisponivel', technicalDetail: 'x' })
  }
  expect(readCard(id)?.fm.status).toBe('WAITING')
  const outcome = applyFailurePolicy({ id, fromStatus: 'EXECUTING', resumeStatus: 'EXECUTING', provider: 'claude', failureClass: 'transient', failureReason: 'rede indisponivel', technicalDetail: 'x' })
  expect(outcome).toBe('halt')
  const c = readCard(id)
  expect(c?.fm.status).toBe('HALTED')
  expect(c?.fm.wait_attempts).toBe('')
  expect(c?.body).toContain('esgotou 3 tentativas de espera')
})

test('cota SEMPRE para o card, mesmo na primeira falha (nao e transiente)', () => {
  const id = card()
  const outcome = applyFailurePolicy({
    id, fromStatus: 'EXECUTING', resumeStatus: 'EXECUTING', provider: 'codex',
    failureClass: 'quota', failureReason: 'cota do provedor esgotada', technicalDetail: 'insufficient_quota',
  })
  expect(outcome).toBe('halt')
  const c = readCard(id)
  expect(c?.fm.status).toBe('HALTED')
  expect(c?.body).toContain('cota do provedor codex esgotada')
  expect(c?.body).toContain('sem troca automatica de provedor')
})

test('o HALT deixa a causa em campo consultavel, nao so no log: classe, provedor e hora', () => {
  const id = card()
  applyFailurePolicy({
    id, fromStatus: 'EXECUTING', resumeStatus: 'EXECUTING', provider: 'codex',
    failureClass: 'quota', failureReason: 'cota da API OpenAI esgotada', technicalDetail: 'insufficient_quota',
  })
  const c = readCard(id)
  expect(c?.fm.halt_class).toBe('quota')
  expect(c?.fm.halt_provider).toBe('codex')
  expect(c?.fm.halt_reason).toBe('cota da API OpenAI esgotada')
  expect(Date.parse(c?.fm.halt_at ?? '')).toBeLessThanOrEqual(Date.now())
})

test('HALT por esgotar as esperas guarda a classe transiente e o provedor que nunca voltou', () => {
  const id = card()
  for (let i = 0; i < 4; i++) {
    applyFailurePolicy({ id, fromStatus: 'EXECUTING', resumeStatus: 'EXECUTING', provider: 'claude', failureClass: 'transient', failureReason: 'rede indisponivel', technicalDetail: 'x' })
  }
  const c = readCard(id)
  expect(c?.fm.status).toBe('HALTED')
  expect(c?.fm.halt_class).toBe('transient')
  expect(c?.fm.halt_provider).toBe('claude')
})

test('terminal SEMPRE para o card, mesmo na primeira falha', () => {
  const id = card()
  const outcome = applyFailurePolicy({
    id, fromStatus: 'EXECUTING', resumeStatus: 'EXECUTING', provider: 'claude',
    failureClass: 'terminal', failureReason: 'credencial invalida', technicalDetail: '401 unauthorized',
  })
  expect(outcome).toBe('halt')
  expect(readCard(id)?.fm.status).toBe('HALTED')
})

test('terminal para na hora sem queimar retentativa: chega ja com tentativas em curso e HALTa mesmo assim, sem incrementar', () => {
  const id = card()
  applyFailurePolicy({ id, fromStatus: 'EXECUTING', resumeStatus: 'EXECUTING', provider: 'claude', failureClass: 'transient', failureReason: 'rede indisponivel', technicalDetail: 'x' })
  expect(readCard(id)?.fm.wait_attempts).toBe('1')
  const outcome = applyFailurePolicy({
    id, fromStatus: 'EXECUTING', resumeStatus: 'EXECUTING', provider: 'claude',
    failureClass: 'terminal', failureReason: 'credencial invalida', technicalDetail: '401 unauthorized',
  })
  expect(outcome).toBe('halt')
  const c = readCard(id)
  expect(c?.fm.status).toBe('HALTED')
  expect(c?.fm.wait_attempts).toBe('')
})

test('extraFields (custo/tokens acumulados) sao gravados junto com a transicao', () => {
  const id = card()
  applyFailurePolicy({
    id, fromStatus: 'EXECUTING', resumeStatus: 'EXECUTING', provider: 'claude',
    failureClass: 'transient', failureReason: 'x', technicalDetail: 'x',
    extraFields: { cost_usd: '1.2345', tokens_total: '999' },
  })
  const c = readCard(id)
  expect(c?.fm.cost_usd).toBe('1.2345')
  expect(c?.fm.tokens_total).toBe('999')
})

test('resumeStep, quando informado, e gravado como resume_from para o polimento retomar do passo certo', () => {
  const id = card()
  applyFailurePolicy({
    id, fromStatus: 'Testes', resumeStatus: 'PREVIEW_OK', resumeStep: 'Testes', provider: 'claude',
    failureClass: 'transient', failureReason: 'x', technicalDetail: 'x',
  })
  expect(readCard(id)?.fm.resume_from).toBe('Testes')
})
