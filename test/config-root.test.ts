import { test, expect } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, cardsDir, reposFile } from '../lib/runner/config'

test('ROOT aponta para uma raiz de repo hicode de verdade', () => {
  expect(existsSync(join(ROOT, 'cards')) || existsSync(join(ROOT, 'config', 'repos.json'))).toBe(true)
})

test('REGRESSAO sem override, cardsDir e reposFile ficam dentro do ROOT resolvido', () => {
  const cards = process.env.HICODE_CARDS_DIR
  const repos = process.env.HICODE_REPOS_FILE
  delete process.env.HICODE_CARDS_DIR
  delete process.env.HICODE_REPOS_FILE
  try {
    expect(cardsDir().startsWith(ROOT)).toBe(true)
    expect(reposFile().startsWith(ROOT)).toBe(true)
  } finally {
    if (cards !== undefined) process.env.HICODE_CARDS_DIR = cards
    if (repos !== undefined) process.env.HICODE_REPOS_FILE = repos
  }
})

test('com override, cardsDir sai do ROOT — e isso e o esperado', () => {
  const prev = process.env.HICODE_CARDS_DIR
  process.env.HICODE_CARDS_DIR = '/tmp/cards-de-teste'
  expect(cardsDir()).toBe('/tmp/cards-de-teste')
  if (prev === undefined) delete process.env.HICODE_CARDS_DIR
  else process.env.HICODE_CARDS_DIR = prev
})

test('HICODE_ROOT tem precedencia sobre a deteccao', async () => {
  const prev = process.env.HICODE_ROOT
  process.env.HICODE_ROOT = '/tmp/raiz-forcada'
  const fresh = await import('../lib/runner/config?forced')
  expect(fresh.ROOT).toBe('/tmp/raiz-forcada')
  if (prev === undefined) delete process.env.HICODE_ROOT
  else process.env.HICODE_ROOT = prev
})
