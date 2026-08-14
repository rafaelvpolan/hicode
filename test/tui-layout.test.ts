import { test, expect } from 'bun:test'
import { renderFrame, stripAnsi, visibleLen, truncVisible, padVisible } from '../lib/core/tui/layout'

const quadro = (over: Partial<Parameters<typeof renderFrame>[0]> = {}): ReturnType<typeof renderFrame> =>
  renderFrame({ rows: 10, cols: 40, header: 'hii', corpo: [], input: '', cursor: 0, dica: '', prompt: '› ', ...over })

test('visibleLen ignora escape ANSI', () => {
  expect(visibleLen('\x1b[32mok\x1b[0m')).toBe(2)
  expect(stripAnsi('\x1b[2mabc\x1b[0m')).toBe('abc')
})

test('truncVisible corta pelo tamanho visivel e fecha o estilo', () => {
  const t = truncVisible('\x1b[32mabcdefgh\x1b[0m', 4)
  expect(visibleLen(t)).toBeLessThanOrEqual(4)
  expect(t).toContain('\x1b[0m')
})

test('truncVisible nao mexe no que ja cabe', () => {
  expect(truncVisible('abc', 10)).toBe('abc')
})

test('padVisible completa pela largura visivel, nao pela string', () => {
  expect(visibleLen(padVisible('\x1b[32mok\x1b[0m', 8))).toBe(8)
})

test('todas as linhas do quadro tem a mesma largura visivel', () => {
  const f = quadro({ cols: 50, corpo: ['curta', 'uma linha bem mais longa que o resto do quadro'] })
  const larguras = new Set(f.lines.map(l => visibleLen(l)))
  expect(larguras.size).toBe(1)
  expect([...larguras][0]).toBe(50)
})

test('quadro tem cabecalho, moldura e input', () => {
  const f = quadro({ header: 'hii · org/app', input: 'tarefa' })
  expect(f.lines[0]).toContain('hii · org/app')
  expect(f.lines[1]).toContain('┌')
  expect(f.lines[f.lines.length - 2]).toContain('└')
  expect(f.lines[f.lines.length - 1]).toContain('tarefa')
})

test('corpo mostra as ULTIMAS linhas quando estoura a altura', () => {
  const corpo = Array.from({ length: 30 }, (_, i) => `linha ${i}`)
  const f = quadro({ rows: 10, corpo })
  const texto = f.lines.join('\n')
  expect(texto).toContain('linha 29')
  expect(texto).not.toContain('linha 0\n')
})

test('altura minima do corpo respeitada em terminal minusculo', () => {
  const f = quadro({ rows: 3, cols: 30 })
  expect(f.lines.length).toBeGreaterThanOrEqual(6)
})

test('largura minima evita moldura negativa', () => {
  const f = quadro({ cols: 5 })
  expect(f.lines.every(l => visibleLen(l) === 24)).toBe(true)
})

test('cursor aponta para a coluna certa dentro do input', () => {
  const f = quadro({ input: 'abcdef', cursor: 3 })
  expect(f.cursorRow).toBe(f.lines.length)
  expect(f.cursorCol).toBe(3 + 2 + 3)
})

test('cursor nao passa do fim do input', () => {
  const f = quadro({ input: 'ab', cursor: 99 })
  expect(f.cursorCol).toBe(3 + 2 + 2)
})

test('dica fica alinhada a direita sem estourar a linha', () => {
  const f = quadro({ cols: 60, input: 'x', dica: '/help  ctrl+c sai' })
  const ultima = f.lines[f.lines.length - 1] ?? ''
  expect(visibleLen(ultima)).toBe(60)
  expect(ultima).toContain('ctrl+c sai')
})

test('conteudo com cor nao quebra o alinhamento da moldura', () => {
  const f = quadro({ cols: 44, corpo: ['\x1b[32m●●●\x1b[0m card verde', '\x1b[31mparou\x1b[0m'] })
  expect(new Set(f.lines.map(l => visibleLen(l))).size).toBe(1)
})
