import { beforeEach, test, expect, afterAll } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-wake-'))
process.env.HICODE_CARDS_DIR = CARDS

let saudavel = true
let atrasoMs = 0
const sonda = (): Promise<boolean> => new Promise(resolve => setTimeout(() => resolve(saudavel), atrasoMs))

const { createCard, readCard, patchCard } = await import('../lib/runner/card-store')
const { wakeDueWaiting } = await import('../lib/runner/waiting')

beforeEach(() => { process.env.HICODE_WAITING_MAX_ATTEMPTS = '2' })

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

function waitingCard(waitUntilMs: number, attempts = '0'): string {
  return createCard({
    title: 'algo', status: 'WAITING', repo: 'org/repo',
    wait_until: isoIn(waitUntilMs), wait_resume_status: 'EXECUTING', wait_provider: 'claude',
    wait_attempts: attempts, wait_reason: 'rede indisponivel',
  }, '## Objetivo\nalgo\n')
}

test('card WAITING ainda nao vencido nao e tocado', async () => {
  saudavel = true
  const id = waitingCard(60_000)
  await wakeDueWaiting(sonda)
  expect(readCard(id)?.fm.status).toBe('WAITING')
})

test('card WAITING vencido + provedor saudavel: retoma automaticamente no status de origem', async () => {
  saudavel = true
  const id = waitingCard(-1000)
  await wakeDueWaiting(sonda)
  const c = readCard(id)
  expect(c?.fm.status).toBe('EXECUTING')
  expect(c?.fm.wait_until).toBe('')
  expect(c?.fm.wait_resume_status).toBe('')
  expect(c?.fm.wait_provider).toBe('')
  expect(c?.body).toContain('retomando automaticamente')
})

test('card WAITING vencido + provedor ainda fora: NAO gasta uma execucao — reagenda e conta a tentativa', async () => {
  saudavel = false
  const id = waitingCard(-1000, '0')
  await wakeDueWaiting(sonda)
  const c = readCard(id)
  expect(c?.fm.status).toBe('WAITING')
  expect(c?.fm.wait_attempts).toBe('1')
  expect(Date.parse(c?.fm.wait_until ?? '')).toBeGreaterThan(Date.now())
})

test('REGRESSAO: sonda de saude sempre negativa eventualmente HALTa (nao fica esperando para sempre)', async () => {
  saudavel = false
  const id = waitingCard(-1000, '2')
  await wakeDueWaiting(sonda)
  const c = readCard(id)
  expect(c?.fm.status).toBe('HALTED')
  expect(c?.body).toContain('sonda de saude')
  expect(c?.fm.halt_class).toBe('transient')
  expect(c?.fm.halt_provider).toBe('claude')
  expect(c?.fm.halt_reason).toBe('rede indisponivel')
})

test('sobrevive a reinicio: um card WAITING com prazo ja vencido antes do processo subir e recuperado no primeiro tick', async () => {
  saudavel = true
  const id = waitingCard(-5 * 60_000)
  patchCard(id, { status: 'WAITING' })
  await wakeDueWaiting(sonda)
  expect(readCard(id)?.fm.status).toBe('EXECUTING')
})

test('REGRESSAO: wait_until vazio (fail-open) nao trava o card para sempre — sonda roda e reagenda mesmo assim', async () => {
  saudavel = false
  const id = createCard({
    title: 'algo', status: 'WAITING', repo: 'org/repo',
    wait_until: '', wait_resume_status: 'EXECUTING', wait_provider: 'claude',
    wait_attempts: '0', wait_reason: 'rede indisponivel',
  }, '## Objetivo\nalgo\n')
  await wakeDueWaiting(sonda)
  const c = readCard(id)
  expect(c?.fm.status).toBe('WAITING')
  expect(c?.fm.wait_attempts).toBe('1')
})

test('REGRESSAO: wait_until com texto nao-parseavel (fail-open) tambem e tratado como vencido', async () => {
  saudavel = true
  const id = createCard({
    title: 'algo', status: 'WAITING', repo: 'org/repo',
    wait_until: 'isso nao e uma data', wait_resume_status: 'EXECUTING', wait_provider: 'claude',
    wait_attempts: '0', wait_reason: 'rede indisponivel',
  }, '## Objetivo\nalgo\n')
  await wakeDueWaiting(sonda)
  expect(readCard(id)?.fm.status).toBe('EXECUTING')
})

test('REGRESSAO: chamadas concorrentes de wakeDueWaiting nao processam o mesmo card em dobro (guarda de reentrancia)', async () => {
  saudavel = false
  atrasoMs = 30
  const id = waitingCard(-1000, '0')
  await Promise.all([wakeDueWaiting(sonda), wakeDueWaiting(sonda)])
  atrasoMs = 0
  expect(readCard(id)?.fm.wait_attempts).toBe('1')
})
