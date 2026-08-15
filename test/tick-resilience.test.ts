import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-tick-'))
const CARDS_QUEBRADO = join(BASE, 'cards-e-um-arquivo')
writeFileSync(CARDS_QUEBRADO, 'isto e um arquivo, nao um diretorio de cards\n')
process.env.HICODE_CARDS_DIR = CARDS_QUEBRADO

const { tick } = await import('../lib/runner/queue')

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

test('REGRESSAO: tick() nao lanca quando o diretorio de cards esta inutilizavel', () => {
  expect(() => tick()).not.toThrow()
})

test('REGRESSAO: tick() repetido continua sem lancar (nao vira crash em loop)', () => {
  for (let i = 0; i < 5; i++) expect(() => tick()).not.toThrow()
})

test('reportTickFailure e recordTickSuccess nunca lancam mesmo sem conseguir gravar em disco', async () => {
  const { reportTickFailure, recordTickSuccess } = await import('../lib/runner/health')
  expect(() => reportTickFailure('ctx', new Error('x'))).not.toThrow()
  expect(() => recordTickSuccess()).not.toThrow()
  expect(existsSync(join(CARDS_QUEBRADO, 'runs'))).toBe(false)
})
