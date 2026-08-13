import { test, expect } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, cardsDir, reposFile } from '../lib/runner/config'

test('ROOT aponta para uma raiz de repo hicode de verdade', () => {
  expect(existsSync(join(ROOT, 'cards')) || existsSync(join(ROOT, 'config', 'repos.json'))).toBe(true)
})

test('REGRESSAO cardsDir e reposFile ficam dentro do ROOT resolvido', () => {
  expect(cardsDir().startsWith(ROOT)).toBe(true)
  expect(reposFile().startsWith(ROOT)).toBe(true)
})

test('HICODE_ROOT tem precedencia sobre a deteccao', async () => {
  const prev = process.env.HICODE_ROOT
  process.env.HICODE_ROOT = '/tmp/raiz-forcada'
  const fresh = await import('../lib/runner/config?forced')
  expect(fresh.ROOT).toBe('/tmp/raiz-forcada')
  if (prev === undefined) delete process.env.HICODE_ROOT
  else process.env.HICODE_ROOT = prev
})
