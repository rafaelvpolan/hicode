import { test, expect } from 'bun:test'
import { larguraDeTexto, larguraDeCaractere, larguraDeGrafema, grafemasDe } from '../lib/core/tui/largura'
import { renderFrame, visibleLen, truncVisible, padVisible, quebrarEmLargura, link } from '../lib/core/tui/layout'
import { caixa } from '../lib/core/render/widget/caixa'
import { barraRotulada } from '../lib/core/render/widget/barra'

const SURROGATE_SOLTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
const FAMILIA = '👨‍👩‍👧'
const E_COMBINANTE = 'e\u0301'

const LARGURAS: ReadonlyArray<readonly [string, number]> = [
  ['a', 1],
  ['中', 2],
  ['😀', 2],
  [FAMILIA, 2],
  [E_COMBINANTE, 1],
  ['\t', 0],
  ['\x07', 0],
  ['', 0],
  ['\u00e9', 1],
  ['日本語', 6],
  ['ｆｕｌｌ', 8],
  ['👍🏽', 2],
  ['🇧🇷', 2],
  ['abc 中', 6],
  ['…', 1],
  ['│─┌┐└┘█░', 8],
]

test('larguraDeTexto mede colunas de terminal, nao code units', () => {
  for (const [texto, colunas] of LARGURAS) expect([texto, larguraDeTexto(texto)]).toEqual([texto, colunas])
})

const CODE_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0x0041, 1], [0x00e9, 1], [0x0301, 0], [0x0009, 0], [0x0007, 0], [0x0000, 0],
  [0x200d, 0], [0xfe0f, 0], [0xe0101, 0],
  [0x10ff, 1], [0x1100, 2], [0x115f, 2], [0x1160, 1],
  [0x2026, 1], [0x2502, 1], [0x2588, 1], [0x23f1, 1], [0x23f3, 2],
  [0x2e80, 2], [0x303e, 2], [0x303f, 1],
  [0x3400, 2], [0x4dbf, 2], [0x4dc0, 1], [0x4e00, 2], [0x9fff, 2],
  [0xac00, 2], [0xd7a3, 2], [0xd7a4, 1],
  [0xfeff, 0], [0xff00, 2], [0xff60, 2], [0xff61, 1],
  [0x1f600, 2], [0x1f1e6, 2], [0x1ffff, 1], [0x20000, 2],
]

test('larguraDeCaractere devolve 0, 1 ou 2 nas bordas de cada faixa', () => {
  for (const [cp, colunas] of CODE_POINTS) {
    expect([cp.toString(16), larguraDeCaractere(cp)]).toEqual([cp.toString(16), colunas])
  }
})

test('larguraDeCaractere nao aceita code point invalido como caractere visivel', () => {
  expect(larguraDeCaractere(Number.NaN)).toBe(0)
  expect(larguraDeCaractere(-1)).toBe(0)
  expect(larguraDeCaractere(1.5)).toBe(0)
})

test('grafemasDe mantem emoji ZWJ e marca combinante como uma unidade so', () => {
  expect(grafemasDe(`a${FAMILIA}中`)).toEqual(['a', FAMILIA, '中'])
  expect(grafemasDe(E_COMBINANTE)).toEqual([E_COMBINANTE])
  expect(larguraDeGrafema(FAMILIA)).toBe(2)
  expect(larguraDeGrafema(E_COMBINANTE)).toBe(1)
})

test('ANSI nao entra na medida: com escape mede igual a sem escape', () => {
  const cru = `中 ok 😀 ${FAMILIA}`
  expect(larguraDeTexto(`\x1b[32m${cru}\x1b[0m`)).toBe(larguraDeTexto(cru))
  expect(larguraDeTexto(`\x1b[2m\x1b[31m${cru}\x1b[0m`)).toBe(larguraDeTexto(cru))
  process.env.HICODE_HYPERLINKS = 'on'
  expect(larguraDeTexto(link('https://exemplo.com/x', cru))).toBe(larguraDeTexto(cru))
  delete process.env.HICODE_HYPERLINKS
})

test('REGRESSAO visibleLen conta colunas, nao code units UTF-16', () => {
  expect(visibleLen('中')).toBe(2)
  expect(visibleLen('😀')).toBe(2)
  expect(visibleLen(FAMILIA)).toBe(2)
  expect(visibleLen(E_COMBINANTE)).toBe(1)
  expect(visibleLen('\t')).toBe(0)
  expect(visibleLen('\x07')).toBe(0)
})

const MISTO = `中a😀${E_COMBINANTE}${FAMILIA}中b`

test('truncVisible corta por coluna e nunca parte um grafema', () => {
  const inteiros = grafemasDe(MISTO)
  for (let max = 0; max <= larguraDeTexto(MISTO) + 2; max++) {
    const t = truncVisible(MISTO, max)
    expect([max, larguraDeTexto(t) <= max]).toEqual([max, true])
    expect([max, SURROGATE_SOLTO.test(t)]).toEqual([max, false])
    const semElipse = t.endsWith('…') ? t.slice(0, -1) : t
    const cortados = grafemasDe(semElipse)
    expect([max, cortados]).toEqual([max, inteiros.slice(0, cortados.length)])
  }
})

const CORTES_ESPERADOS: ReadonlyArray<readonly [number, string]> = [
  [0, ''],
  [1, '…'],
  [2, '…'],
  [3, '中…'],
  [4, '中a…'],
  [5, '中a…'],
  [6, '中a😀…'],
  [7, `中a😀${E_COMBINANTE}…`],
  [8, `中a😀${E_COMBINANTE}…`],
  [9, `中a😀${E_COMBINANTE}${FAMILIA}…`],
  [10, `中a😀${E_COMBINANTE}${FAMILIA}…`],
  [11, MISTO],
  [12, MISTO],
]

test('truncVisible aproveita as colunas: corta no maior prefixo que cabe com a elipse', () => {
  for (const [max, esperado] of CORTES_ESPERADOS) {
    expect([max, truncVisible(MISTO, max)]).toEqual([max, esperado])
  }
})

test('atalho de ASCII imprimivel mede igual ao caminho de grafemas', () => {
  const segmentador = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' })
  const referencia = (s: string): number => {
    let total = 0
    for (const parte of segmentador.segment(s)) {
      let maior = 0
      for (const caractere of parte.segment) {
        maior = Math.max(maior, larguraDeCaractere(caractere.codePointAt(0) ?? -1))
      }
      total += maior
    }
    return total
  }
  const amostras = ['ascii puro', '', ' ', '~!@#$%^&*()_+=[]{}|;:,.<>?/', 'a'.repeat(200), 'hii · org/app', MISTO,
    '\t tab no meio', 'linha\ncom quebra', '中a', `${FAMILIA}!`, '│─ moldura ─│']
  for (const s of amostras) expect([s, larguraDeTexto(s)]).toEqual([s, referencia(s)])
})

test('truncVisible nao parte par surrogate ao cortar emoji', () => {
  for (let max = 1; max <= 8; max++) {
    const t = truncVisible('😀😀😀', max)
    expect([max, SURROGATE_SOLTO.test(t)]).toEqual([max, false])
    expect([max, larguraDeTexto(t) <= max]).toEqual([max, true])
  }
})

test('truncVisible de conteudo largo com cor fecha o estilo e respeita as colunas', () => {
  const t = truncVisible('\x1b[32m中中中中\x1b[0m', 5)
  expect(larguraDeTexto(t)).toBeLessThanOrEqual(5)
  expect(t).toContain('\x1b[0m')
  expect(t).toContain('…')
})

test('padVisible completa ate a largura em COLUNAS: um CJK come um espaco a mais', () => {
  expect(padVisible('中', 10)).toBe(`中${' '.repeat(8)}`)
  expect(padVisible('a', 10)).toBe(`a${' '.repeat(9)}`)
  expect(padVisible('😀', 6)).toBe(`😀${' '.repeat(4)}`)
  expect(padVisible(FAMILIA, 6)).toBe(`${FAMILIA}${' '.repeat(4)}`)
  expect(padVisible(E_COMBINANTE, 6)).toBe(`${E_COMBINANTE}${' '.repeat(5)}`)
})

test('padVisible entrega EXATAMENTE a largura pedida, cortando ou completando', () => {
  const amostras = ['中'.repeat(10), `${FAMILIA} familia`, '😀 emoji 中文', 'ascii puro', '', E_COMBINANTE]
  for (const s of amostras) {
    for (const largura of [1, 2, 3, 5, 7, 8, 12, 20]) {
      expect([s, largura, larguraDeTexto(padVisible(s, largura))]).toEqual([s, largura, largura])
    }
  }
})

const QUADRO = {
  rows: 14,
  cols: 50,
  header: 'hii · 🚀 中文 tarefa',
  corpo: [`${FAMILIA} familia`, '中文中文中文中文中文中文中文中文中文中文中文', '😀', 'linha ascii'],
  input: 'a',
  cursor: 1,
  dica: '',
  prompt: '› ',
  rodape: ['rodape 中'],
}

test('REGRESSAO renderFrame com emoji e CJK mantem toda linha na mesma largura em colunas', () => {
  const f = renderFrame(QUADRO)
  expect([...new Set(f.lines.map(l => larguraDeTexto(l)))]).toEqual([50])
})

test('REGRESSAO renderFrame com moldura e legenda em CJK segue alinhado', () => {
  const f = renderFrame({ ...QUADRO, legenda: '中文 🚀 legenda', input: `中${FAMILIA}`, cursor: 2, dica: 'dica 中' })
  expect([...new Set(f.lines.map(l => larguraDeTexto(l)))]).toEqual([50])
})

const CAMPO = { rows: 12, cols: 40, header: 'hii', corpo: [], dica: '', prompt: '› ', rodape: [] }
const RECUO_SEM_MOLDURA = 3
const RECUO_COM_MOLDURA = 5
const PROMPT_EM_COLUNAS = 2

test('REGRESSAO cursorCol e coluna de terminal, nao indice de code unit UTF-16', () => {
  for (const entrada of ['abc', '中文', '中文abc', 'a中b', `${FAMILIA}x`, '😀']) {
    const f = renderFrame({ ...CAMPO, input: entrada, cursor: entrada.length })
    expect([entrada, f.cursorCol])
      .toEqual([entrada, RECUO_SEM_MOLDURA + PROMPT_EM_COLUNAS + larguraDeTexto(entrada)])
  }
})

test('REGRESSAO cursorCol conta so a linha do cursor, em colunas, dentro da moldura', () => {
  const multilinha = renderFrame({ ...CAMPO, rows: 14, input: 'um\n中文', cursor: 'um\n中文'.length })
  expect(multilinha.cursorCol).toBe(RECUO_SEM_MOLDURA + PROMPT_EM_COLUNAS + 4)
  const comMoldura = renderFrame({ ...CAMPO, legenda: 'entrada', input: '中文', cursor: 2 })
  expect(comMoldura.cursorCol).toBe(RECUO_COM_MOLDURA + PROMPT_EM_COLUNAS + 4)
})

test('REGRESSAO caixa com emoji e CJK mantem toda linha na mesma largura em colunas', () => {
  for (const color of [false, true]) {
    const b = caixa('🚀 中文', [`${FAMILIA} familia`, '中'.repeat(30), 'ok', ''], { color, largura: 24 })
    expect([color, [...new Set(b.map(l => larguraDeTexto(l)))]]).toEqual([color, [24]])
  }
})

test('REGRESSAO caixa com titulo largo impar nao estoura nem encolhe a moldura', () => {
  for (const largura of [6, 7, 8, 11, 12, 13, 20, 21]) {
    const b = caixa('中文中文中文', ['中a', '😀b'], { color: false, largura })
    expect([largura, [...new Set(b.map(l => larguraDeTexto(l)))]]).toEqual([largura, [largura]])
  }
})

test('REGRESSAO barraRotulada com rotulo em CJK mantem a largura da barra', () => {
  const o = { color: false, largura: 10, rotuloEm: 8 }
  const larguras = new Set([
    larguraDeTexto(barraRotulada('中文', 3, 10, o)),
    larguraDeTexto(barraRotulada('ascii', 3, 10, o)),
    larguraDeTexto(barraRotulada('中文中文中文', 3, 10, o)),
  ])
  expect([...larguras]).toEqual([8 + 1 + 10])
})

test('REGRESSAO quebrarEmLargura conta colunas: linha de CJK nao passa da largura', () => {
  const linhas = quebrarEmLargura('中文 '.repeat(40).trim(), 40)
  expect(linhas.length).toBeGreaterThan(1)
  for (const l of linhas) expect([l, larguraDeTexto(l) <= 40]).toEqual([l, true])
  expect(linhas.join(' ').split(/\s+/)).toEqual(new Array<string>(40).fill('中文'))
})
