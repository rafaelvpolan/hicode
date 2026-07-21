import { test, expect } from 'bun:test'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initHicodeHome, readProjectConfig, readProjectRules } from '../lib/runner/hicode-home'

test('initHicodeHome cria .hii/ sem apagar a memoria do alvo', () => {
  const d = mkdtempSync(join(tmpdir(), 'hicode-alvo-'))
  writeFileSync(join(d, 'CLAUDE.md'), 'memoria do repo alvo')
  const created = initHicodeHome(d)
  expect(readFileSync(join(d, 'CLAUDE.md'), 'utf8')).toBe('memoria do repo alvo')
  expect(existsSync(join(d, '.hii', 'config.json'))).toBe(true)
  expect(existsSync(join(d, '.hii', 'memory'))).toBe(true)
  expect(created.length).toBeGreaterThan(0)
  expect(readProjectConfig(d).provider).toBe('claude')
})

test('init e idempotente (segunda vez nao recria)', () => {
  const d = mkdtempSync(join(tmpdir(), 'hicode-alvo2-'))
  initHicodeHome(d)
  expect(initHicodeHome(d).length).toBe(0)
})

test('init migra .hicode/ legado para .hii/ preservando conteudo', () => {
  const d = mkdtempSync(join(tmpdir(), 'hicode-legado-'))
  mkdirSync(join(d, '.hicode', 'memory'), { recursive: true })
  writeFileSync(join(d, '.hicode', 'rules.md'), 'regras antigas')
  const created = initHicodeHome(d)
  expect(existsSync(join(d, '.hicode'))).toBe(false)
  expect(existsSync(join(d, '.hii', 'memory'))).toBe(true)
  expect(readProjectRules(d)).toBe('regras antigas')
  expect(created.some(c => c.includes('migrado'))).toBe(true)
})

test('readProjectRules vazio quando nao ha .hii/rules.md', () => {
  const d = mkdtempSync(join(tmpdir(), 'hicode-vazio-'))
  expect(readProjectRules(d)).toBe('')
})
