import { test, expect, afterAll, mock } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-tickhealth-'))
process.env.HICODE_CARDS_DIR = CARDS
mkdirSync(join(CARDS, 'runs'), { recursive: true })

const realMerge = await import('../lib/runner/merge')
mock.module('../lib/runner/merge', () => ({
  ...realMerge,
  checkMerged: (): Promise<void> => Promise.reject(new Error('gh indisponivel')),
}))

const { tick } = await import('../lib/runner/queue')

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

function healthFile(): string {
  return join(CARDS, 'runs', 'daemon-health.json')
}

function readHealth(): { consecutiveFailures: number; lastError: string } {
  return JSON.parse(readFileSync(healthFile(), 'utf8')) as { consecutiveFailures: number; lastError: string }
}

async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 20))
}

test('REGRESSAO: falha assincrona persistente do checkMerged ESCALA — nao e apagada pelo sucesso sincrono do mesmo tick', async () => {
  tick()
  await flush()
  const h1 = readHealth()
  expect(h1.lastError).toContain('checkMerged: gh indisponivel')
  expect(h1.consecutiveFailures).toBe(1)

  tick()
  await flush()
  const h2 = readHealth()
  expect(h2.consecutiveFailures).toBe(2)

  tick()
  await flush()
  const h3 = readHealth()
  expect(h3.consecutiveFailures).toBe(3)
})
