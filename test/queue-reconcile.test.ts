import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-queue-'))
process.env.HICODE_CARDS_DIR = CARDS

const { createCard, readCard } = await import('../lib/runner/card-store')
const { reconcileStranded, pending } = await import('../lib/runner/queue-state')

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

function card(status: string, title = status.toLowerCase()): string {
  return createCard({ title, status, repo: 'org/repo' }, '## Objetivo\nalgo\n')
}

function statusOf(id: string): string {
  return readCard(id)?.fm.status ?? ''
}

test('reconcile: estados de polimento voltam para PREVIEW_OK', () => {
  const ids = ['REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED', 'CLEANED'].map(s => card(s))
  reconcileStranded()
  for (const id of ids) expect(statusOf(id)).toBe('PREVIEW_OK')
})

test('reconcile: EXECUTED volta para EXECUTING (nao havia consumidor)', () => {
  const id = card('EXECUTED')
  reconcileStranded()
  expect(statusOf(id)).toBe('EXECUTING')
})

test('reconcile: estados reexecutaveis mantem o status', () => {
  const ids = ['EXECUTING', 'CORRECTING', 'SPECCED'].map(s => card(s))
  const antes = ids.map(statusOf)
  reconcileStranded()
  expect(ids.map(statusOf)).toEqual(antes)
})

test('reconcile: estados terminais e de espera nao sao tocados', () => {
  const intocaveis = ['READY', 'CLARIFY', 'PREVIEW', 'PREVIEW_OK', 'PR_OPEN', 'MERGED', 'HALTED', 'PAUSED']
  const ids = intocaveis.map(s => card(s))
  reconcileStranded()
  expect(ids.map(statusOf)).toEqual(intocaveis)
})

test('reconcile: registra o motivo no log do card', () => {
  const id = card('REVIEWED')
  reconcileStranded()
  expect(readCard(id)?.body).toContain('recuperado apos reinicio do daemon')
})

test('reconcile e idempotente: rodar duas vezes nao muda mais nada', () => {
  const id = card('CLEANED')
  reconcileStranded()
  const depois = statusOf(id)
  reconcileStranded()
  expect(statusOf(id)).toBe(depois)
})

function ocorrencias(id: string, trecho: string): number {
  return (readCard(id)?.body.match(new RegExp(trecho, 'g')) ?? []).length
}

test('REGRESSAO: reinicio repetido nao duplica a linha de interrompido no card', () => {
  const id = card('EXECUTING')
  reconcileStranded()
  reconcileStranded()
  reconcileStranded()
  expect(ocorrencias(id, 'interrompido por reinicio do daemon')).toBe(1)
})

test('REGRESSAO: card que muda de estado volta a registrar o interrompido', async () => {
  const { patchCard } = await import('../lib/runner/card-store')
  const id = card('EXECUTING')
  reconcileStranded()
  patchCard(id, { status: 'CORRECTING' })
  reconcileStranded()
  expect(ocorrencias(id, 'interrompido por reinicio do daemon')).toBe(2)
})

test('pending: spec vem antes de execute, finish e correct', () => {
  const sp = card('SPECCED')
  const ex = card('EXECUTING')
  const fi = card('PREVIEW_OK')
  const co = card('CORRECTING')
  const jobs = pending()
  const pos = (id: string): number => jobs.findIndex(j => j.id === id)
  expect(pos(sp)).toBeGreaterThanOrEqual(0)
  expect(pos(sp)).toBeLessThan(pos(ex))
  expect(pos(ex)).toBeLessThan(pos(fi))
  expect(pos(fi)).toBeLessThan(pos(co))
})

test('pending: mapeia cada status para o job correto', () => {
  const ex = card('EXECUTING')
  const fi = card('PREVIEW_OK')
  const co = card('CORRECTING')
  const sp = card('SPECCED')
  const kind = (id: string): string => pending().find(j => j.id === id)?.kind ?? ''
  expect(kind(ex)).toBe('execute')
  expect(kind(fi)).toBe('finish')
  expect(kind(co)).toBe('correct')
  expect(kind(sp)).toBe('spec')
})

test('pending: status sem job nao entra na fila', () => {
  const parado = card('HALTED')
  const esperando = card('PREVIEW')
  const ids = pending().map(j => j.id)
  expect(ids).not.toContain(parado)
  expect(ids).not.toContain(esperando)
})
