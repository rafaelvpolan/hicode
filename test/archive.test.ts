import { test, expect, afterAll, beforeEach } from 'bun:test'
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-arq-'))
process.env.HICODE_CARDS_DIR = CARDS

const A = await import('../lib/core/archive')
const { submit, transition } = await import('../lib/core/actions')
const { allCards } = await import('../lib/runner/card-store')

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

beforeEach(() => {
  for (const f of readdirSync(CARDS)) {
    if (f.endsWith('.md')) rmSync(join(CARDS, f))
  }
  if (existsSync(A.archiveDir())) rmSync(A.archiveDir(), { recursive: true, force: true })
})

function card(repo: string, status: string, updated?: string): string {
  const id = submit({ title: `${repo} ${status}`, repo })
  transition(id, status)
  if (updated) {
    const { updateCard } = require('../lib/runner/card-store') as typeof import('../lib/runner/card-store')
    updateCard(id, { fields: { updated } })
  }
  return id
}

function noDisco(): number {
  return readdirSync(CARDS).filter(f => f.endsWith('.md')).length
}

test('abaixo do teto nao move nada', () => {
  for (let i = 0; i < 5; i++) card('org/app', 'MERGED')
  expect(A.arquivar(10).movidos).toEqual([])
  expect(noDisco()).toBe(5)
})

test('acima do teto arquiva os terminais mais antigos', () => {
  for (let i = 0; i < 12; i++) card('org/app', 'MERGED', `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`)
  const r = A.arquivar(10)
  expect(r.movidos.length).toBe(2)
  expect(noDisco()).toBe(10)
  expect(A.listarArquivados().length).toBe(2)
})

test('teto vale POR PROJETO, nao no total', () => {
  for (let i = 0; i < 8; i++) card('org/app', 'MERGED', `2026-01-0${(i % 9) + 1}T00:00:00Z`)
  for (let i = 0; i < 8; i++) card('org/api', 'MERGED', `2026-02-0${(i % 9) + 1}T00:00:00Z`)
  expect(allCards().length).toBe(16)
  expect(A.arquivar(10).movidos).toEqual([])
  expect(noDisco()).toBe(16)
})

test('cada projeto e podado no seu proprio teto', () => {
  for (let i = 0; i < 12; i++) card('org/app', 'MERGED', `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`)
  for (let i = 0; i < 3; i++) card('org/api', 'MERGED')
  const r = A.arquivar(10)
  expect(r.movidos.every(m => m.repo === 'org/app')).toBe(true)
  expect(r.movidos.length).toBe(2)
  const porRepo = Object.fromEntries(r.projetos.map(p => [p.repo, p.total - p.movidos.length]))
  expect(porRepo['org/app']).toBe(10)
  expect(porRepo['org/api']).toBe(3)
})

test('REGRESSAO card em andamento NUNCA e arquivado, nem acima do teto', () => {
  for (let i = 0; i < 12; i++) card('org/app', 'EXECUTING')
  const r = A.arquivar(10)
  expect(r.movidos).toEqual([])
  expect(noDisco()).toBe(12)
  expect(r.projetos[0]?.acimaDoTeto).toBe(2)
})

test('PR_OPEN e HALTED ficam — esperam humano', () => {
  for (let i = 0; i < 6; i++) card('org/app', 'PR_OPEN')
  for (let i = 0; i < 6; i++) card('org/app', 'HALTED')
  expect(A.arquivar(10).movidos).toEqual([])
})

test('arquiva o que da e reporta o que ainda passa do teto', () => {
  for (let i = 0; i < 8; i++) card('org/app', 'EXECUTING')
  for (let i = 0; i < 4; i++) card('org/app', 'MERGED', `2026-01-0${i + 1}T00:00:00Z`)
  const r = A.arquivar(10)
  expect(r.movidos.length).toBe(2)
  expect(r.projetos[0]?.acimaDoTeto).toBe(0)
})

test('card arquivado sai da visao do motor', () => {
  for (let i = 0; i < 12; i++) card('org/app', 'MERGED', `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`)
  const antes = allCards().length
  const r = A.arquivar(10)
  expect(allCards().length).toBe(antes - r.movidos.length)
  const ids = allCards().map(c => c.id)
  for (const m of r.movidos) expect(ids).not.toContain(m.id)
})

test('restaurar traz de volta, e por numero sem zero a esquerda', () => {
  for (let i = 0; i < 12; i++) card('org/app', 'MERGED', `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`)
  const movido = A.arquivar(10).movidos[0]
  expect(movido).toBeDefined()
  const semZero = String(Number(movido?.id))
  expect(A.restaurar(semZero)).toBe(true)
  expect(allCards().some(c => c.id === movido?.id)).toBe(true)
})

test('restaurar id inexistente devolve false', () => {
  expect(A.restaurar('999')).toBe(false)
})

test('restaurar nao sobrescreve card ativo com o mesmo id', () => {
  for (let i = 0; i < 12; i++) card('org/app', 'MERGED', `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`)
  const movido = A.arquivar(10).movidos[0]
  expect(A.restaurar(String(movido?.id))).toBe(true)
  expect(A.restaurar(String(movido?.id))).toBe(false)
})

test('precisaArquivar so e verdade quando ha o que mover', () => {
  for (let i = 0; i < 12; i++) card('org/app', 'EXECUTING')
  expect(A.precisaArquivar(10)).toBe(false)
  card('org/app', 'MERGED')
  expect(A.precisaArquivar(10)).toBe(true)
})

test('arquivo solto sem id nao quebra o arquivamento', () => {
  writeFileSync(join(CARDS, 'zz-sem-id.md'), '---\ntitle: orfao\n---\n\ncorpo\n')
  for (let i = 0; i < 12; i++) card('org/app', 'MERGED', `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`)
  expect(() => A.arquivar(10)).not.toThrow()
})
