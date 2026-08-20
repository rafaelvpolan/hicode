import { test, expect } from 'bun:test'
import { origemAutorizada } from '../panel/server/utils/origin-guard'

const HOST_ESPERADO = '127.0.0.1:4318'

test('sem header Origin/Referer passa (chamada direta do proprio operador)', () => {
  expect(origemAutorizada(null, HOST_ESPERADO)).toBe(true)
})

test('Origin da propria origem passa', () => {
  expect(origemAutorizada('http://127.0.0.1:4318', HOST_ESPERADO)).toBe(true)
})

test('Origin de outro site e bloqueada', () => {
  expect(origemAutorizada('https://evil.example', HOST_ESPERADO)).toBe(false)
})

test('Origin opaca ("null", de iframe sandboxed ou data:) e bloqueada', () => {
  expect(origemAutorizada('null', HOST_ESPERADO)).toBe(false)
})

test('Origin mal formada e bloqueada, nao tratada como ausente', () => {
  expect(origemAutorizada('not-a-url', HOST_ESPERADO)).toBe(false)
})
