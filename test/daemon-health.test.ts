import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-health-'))
process.env.HICODE_CARDS_DIR = CARDS

const { reportTickFailure, recordTickSuccess } = await import('../lib/runner/health')

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

function healthFile(): string {
  return join(CARDS, 'runs', 'daemon-health.json')
}

test('primeira falha registra consecutiveFailures=1', () => {
  const h = reportTickFailure('podar', new Error('ENOENT: sumiu'))
  expect(h.consecutiveFailures).toBe(1)
  expect(h.lastError).toContain('podar: ENOENT')
})

test('falha repetida (mesmo erro) incrementa o contador', () => {
  reportTickFailure('podar', new Error('sempre o mesmo'))
  const h = reportTickFailure('podar', new Error('sempre o mesmo'))
  expect(h.consecutiveFailures).toBe(2)
})

test('erro diferente reinicia o contador em 1 (nao acumula com o anterior)', () => {
  reportTickFailure('podar', new Error('erro A'))
  reportTickFailure('podar', new Error('erro A'))
  const h = reportTickFailure('podar', new Error('erro B, diferente'))
  expect(h.consecutiveFailures).toBe(1)
})

test('recordTickSuccess zera o contador de falhas', () => {
  reportTickFailure('podar', new Error('quebrou'))
  recordTickSuccess()
  const h = reportTickFailure('podar', new Error('quebrou de novo, outro motivo'))
  expect(h.consecutiveFailures).toBe(1)
})

test('o estado persiste em disco entre chamadas (sobrevive a reinicio do processo)', () => {
  reportTickFailure('checkMerged', new Error('persistente'))
  const raw = JSON.parse(readFileSync(healthFile(), 'utf8')) as { consecutiveFailures: number; lastError: string }
  expect(raw.consecutiveFailures).toBe(1)
  expect(raw.lastError).toContain('persistente')
})

test('reportTickFailure nunca lanca, mesmo com cardsDir corrompido/inacessivel', () => {
  const cardsDirValida = process.env.HICODE_CARDS_DIR
  const arquivoNoLugarDoDiretorio = join(tmpdir(), `hicode-health-corrompido-${Date.now()}`)
  writeFileSync(arquivoNoLugarDoDiretorio, 'isto e um arquivo, nao um diretorio de cards\n')
  process.env.HICODE_CARDS_DIR = arquivoNoLugarDoDiretorio
  try {
    expect(() => reportTickFailure('x', new Error('y'))).not.toThrow()
  } finally {
    process.env.HICODE_CARDS_DIR = cardsDirValida
    rmSync(arquivoNoLugarDoDiretorio, { force: true })
  }
})
