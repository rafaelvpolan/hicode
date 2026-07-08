import { test, expect } from 'bun:test'
import { findViolations, stripNonCode } from '../scripts/no-any-detect.mjs'

test('flagra : any e as any em codigo', () => {
  expect(findViolations('const x: any = 1', 'ts').length).toBe(1)
  expect(findViolations('const y = z as any', 'ts').length).toBe(1)
  expect(findViolations('function f(): unknown {}', 'ts').length).toBe(1)
})

test('ignora any dentro de string ou comentario', () => {
  expect(findViolations('const s = "as any"', 'ts').length).toBe(0)
  expect(findViolations('// isto menciona any', 'ts').length).toBe(0)
})

test('codigo limpo nao tem violacao', () => {
  expect(findViolations('const n: number = 1\nlet s: string', 'ts').length).toBe(0)
})

test('stripNonCode zera strings e comentarios preservando linhas', () => {
  const out = stripNonCode('a\n// c\n"str"')
  expect(out.split('\n').length).toBe(3)
})
