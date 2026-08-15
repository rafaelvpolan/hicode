import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-cardcache-'))
process.env.HICODE_CARDS_DIR = CARDS

const { createCard, allCards, cardsByStatus } = await import('../lib/runner/card-store')
const { pending } = await import('../lib/runner/queue-state')

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

function cardPath(id: string): string {
  return join(CARDS, readdirSync(CARDS).find(f => f.startsWith(`${id}-`)) ?? '')
}

function editarPorFora(id: string, trechoAntigo: string, trechoNovo: string): void {
  const caminho = cardPath(id)
  const raw = readFileSync(caminho, 'utf8')
  expect(raw).toContain(trechoAntigo)
  const tmp = `${caminho}.editor-externo-tmp`
  writeFileSync(tmp, raw.replace(trechoAntigo, trechoNovo))
  renameSync(tmp, caminho)
}

test('REGRESSAO: allCards() enxerga edicao feita por fora do processo (nao serve status em cache)', () => {
  const id = createCard({ title: 'card vivo', status: 'READY', repo: 'org/repo' }, '## Objetivo\nalgo\n')
  expect(allCards().find(c => c.id === id)?.status).toBe('READY')
  editarPorFora(id, 'status: READY', 'status: EXECUTING')
  expect(allCards().find(c => c.id === id)?.status).toBe('EXECUTING')
})

test('REGRESSAO: cardsByStatus() nao mistura card que mudou de fila por fora', () => {
  const id = createCard({ title: 'muda de fila', status: 'PREVIEW_OK', repo: 'org/repo' }, '## Objetivo\nalgo\n')
  expect(cardsByStatus('PREVIEW_OK').map(c => c.id)).toContain(id)
  editarPorFora(id, 'status: PREVIEW_OK', 'status: CORRECTING')
  expect(cardsByStatus('PREVIEW_OK').map(c => c.id)).not.toContain(id)
  expect(cardsByStatus('CORRECTING').map(c => c.id)).toContain(id)
})

test('REGRESSAO: valor de mesmo tamanho editado por fora tambem invalida o cache (nao so mudanca de tamanho)', () => {
  const id = createCard({ title: 'custo', status: 'READY', cost_usd: '1.0000', repo: 'org/repo' }, '## Objetivo\nalgo\n')
  expect(allCards().find(c => c.id === id)?.cost_usd).toBe('1.0000')
  editarPorFora(id, 'cost_usd: 1.0000', 'cost_usd: 9.0000')
  expect(allCards().find(c => c.id === id)?.cost_usd).toBe('9.0000')
})

test('REGRESSAO: pending() em chamadas separadas ve status alterado por fora entre elas', () => {
  const id = createCard({ title: 'fila', status: 'EXECUTING', repo: 'org/repo' }, '## Objetivo\nalgo\n')
  expect(pending().some(j => j.id === id && j.kind === 'execute')).toBe(true)
  editarPorFora(id, 'status: EXECUTING', 'status: HALTED')
  expect(pending().some(j => j.id === id)).toBe(false)
})
