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

import { link, linkificar } from '../lib/core/tui/layout'

test('link OSC 8 nao conta como largura visivel', () => {
  const l = link('https://github.com/org/repo/pull/18', 'PR #18')
  expect(visibleLen(l)).toBe(6)
  expect(stripAnsi(l)).toBe('PR #18')
})

test('linkificar transforma url em link mantendo a largura do texto', () => {
  const t = linkificar('veja https://exemplo.com/x agora')
  expect(visibleLen(t)).toBe('veja https://exemplo.com/x agora'.length)
  expect(t).toContain('\x1b]8;;')
})

test('linkificar nao mexe em texto sem url', () => {
  expect(linkificar('sem link aqui')).toBe('sem link aqui')
})

test('REGRESSAO moldura continua alinhada com link no corpo', () => {
  const f = quadro({ cols: 60, corpo: [linkificar('preview → http://localhost:5220'), 'linha normal'] })
  expect(new Set(f.lines.map(l => visibleLen(l))).size).toBe(1)
})

test('truncar linha com link nao corta no meio do escape', () => {
  const t = truncVisible(linkificar('https://exemplo.com/muito/longo/mesmo'), 10)
  expect(visibleLen(t)).toBeLessThanOrEqual(10)
})

import { posicaoNoTexto } from '../lib/core/tui/layout'

test('posicaoNoTexto encontra linha e coluna do cursor', () => {
  expect(posicaoNoTexto('ab\ncd', 4)).toEqual({ linha: 1, coluna: 1 })
  expect(posicaoNoTexto('ab\ncd', 0)).toEqual({ linha: 0, coluna: 0 })
  expect(posicaoNoTexto('abc', 99)).toEqual({ linha: 0, coluna: 3 })
})

test('input multilinha ocupa uma linha do quadro por linha do texto', () => {
  const f = quadro({ rows: 14, input: 'um\ndois\ntres' })
  const ultimas = f.lines.slice(-3).map(l => stripAnsi(l))
  expect(ultimas[0]).toContain('um')
  expect(ultimas[1]).toContain('dois')
  expect(ultimas[2]).toContain('tres')
})

test('cursor cai na linha certa do input multilinha', () => {
  const f = quadro({ rows: 14, input: 'um\ndois', cursor: 5 })
  expect(f.cursorRow).toBe(f.lines.length)
  expect(f.cursorCol).toBe(3 + 2 + 2)
})

test('input multilinha nao quebra o alinhamento do quadro', () => {
  const f = quadro({ rows: 14, cols: 56, input: 'um\ndois', dica: '/help' })
  expect(new Set(f.lines.map(l => visibleLen(l))).size).toBe(1)
})

test('so a primeira linha do input leva o prompt', () => {
  const f = quadro({ rows: 14, input: 'a\nb', prompt: '› ' })
  const [pen, ult] = f.lines.slice(-2).map(l => stripAnsi(l))
  expect(pen?.trimStart().startsWith('›')).toBe(true)
  expect(ult?.trimStart().startsWith('›')).toBe(false)
})
