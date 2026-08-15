import { test, expect, beforeEach } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { memoTempo, memoArquivo, memoChave } from '../lib/core/cache'

let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hicode-cache-')) })

test('memoTempo nao chama de novo dentro da janela', () => {
  let n = 0
  let agora = 1000
  const f = memoTempo(() => ++n, 300, () => agora)
  expect(f()).toBe(1)
  agora = 1200
  expect(f()).toBe(1)
  expect(n).toBe(1)
})

test('memoTempo recalcula depois da janela', () => {
  let n = 0
  let agora = 1000
  const f = memoTempo(() => ++n, 300, () => agora)
  f()
  agora = 1400
  expect(f()).toBe(2)
})

test('memoArquivo recalcula quando o arquivo muda', () => {
  const alvo = join(dir, 'a.txt')
  writeFileSync(alvo, 'um')
  let n = 0
  const f = memoArquivo(() => alvo, () => ++n)
  expect(f('x')).toBe(1)
  expect(f('x')).toBe(1)
  writeFileSync(alvo, 'dois diferente')
  expect(f('x')).toBe(2)
})

test('memoArquivo trata arquivo ausente sem explodir', () => {
  let n = 0
  const f = memoArquivo(() => join(dir, 'nao-existe'), () => ++n)
  expect(f('x')).toBe(1)
  expect(f('x')).toBe(1)
})

test('memoArquivo guarda por chave, nao mistura cards', () => {
  const a = join(dir, 'a'); const b = join(dir, 'b')
  writeFileSync(a, '1'); writeFileSync(b, '2')
  const vistos: string[] = []
  const f = memoArquivo((k) => (k === 'a' ? a : b), (k) => { vistos.push(k); return k.toUpperCase() })
  expect(f('a')).toBe('A')
  expect(f('b')).toBe('B')
  expect(f('a')).toBe('A')
  expect(vistos).toEqual(['a', 'b'])
})

test('arquivo apagado invalida o cache', () => {
  const alvo = join(dir, 'a.txt')
  writeFileSync(alvo, 'um')
  let n = 0
  const f = memoArquivo(() => alvo, () => ++n)
  expect(f('x')).toBe(1)
  rmSync(alvo)
  expect(f('x')).toBe(2)
})

test('memoChave recalcula quando a chave muda', () => {
  let chave = 'a'
  let n = 0
  const f = memoChave(() => chave, () => ++n)
  expect(f()).toBe(1)
  expect(f()).toBe(1)
  chave = 'b'
  expect(f()).toBe(2)
})
