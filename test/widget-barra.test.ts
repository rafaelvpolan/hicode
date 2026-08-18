import { test, expect } from 'bun:test'
import { barra, barraRotulada, severidadeDe } from '../lib/core/render/widget/barra'
import { stripAnsi, visibleLen } from '../lib/core/tui/layout'

const CRU = { color: false, largura: 18 }
const COLORIDO = { color: true, largura: 18 }
const COM_PERCENTUAL = { ...CRU, mostrarPercentual: true }
const ANSI = /\x1b/

test('barra desenha cheio proporcional e vazio no resto', () => {
  expect(barra(9, 18, CRU)).toBe('█'.repeat(9) + '░'.repeat(9))
  expect(barra(0, 18, CRU)).toBe('░'.repeat(18))
  expect(barra(18, 18, CRU)).toBe('█'.repeat(18))
})

test('percentual entra a direita com uma coluna de folga', () => {
  expect(barra(62, 100, COM_PERCENTUAL)).toBe('█'.repeat(11) + '░'.repeat(7) + '  62%')
  expect(barra(100, 100, COM_PERCENTUAL)).toBe('█'.repeat(18) + ' 100%')
  expect(barra(0, 100, COM_PERCENTUAL)).toBe('░'.repeat(18) + '   0%')
})

test('largura visivel e constante em todo valor de 0 a total, inclusive saturado', () => {
  const total = 40
  const larguras = new Set<number>()
  for (let valor = 0; valor <= total; valor++) {
    larguras.add(visibleLen(barra(valor, total, CRU)))
    larguras.add(visibleLen(barra(valor, total, COLORIDO)))
  }
  larguras.add(visibleLen(barra(total * 3, total, CRU)))
  larguras.add(visibleLen(barra(-7, total, CRU)))
  expect([...larguras]).toEqual([18])
})

test('largura visivel com percentual tambem e constante — inclusive nos tres digitos', () => {
  const total = 40
  const larguras = new Set<number>()
  for (let valor = -3; valor <= total + 3; valor++) {
    larguras.add(visibleLen(barra(valor, total, COM_PERCENTUAL)))
    larguras.add(visibleLen(barra(valor, total, { ...COLORIDO, mostrarPercentual: true })))
  }
  expect([...larguras]).toEqual([18 + 1 + 4])
})

test('barra cheia significa saturacao: quase-cheio guarda a ultima coluna vazia', () => {
  const o = { color: false, largura: 10 }
  expect(barra(99, 100, o)).toBe('█'.repeat(9) + '░')
  expect(barra(100, 100, o)).toBe('█'.repeat(10))
  for (let largura = 1; largura <= 30; largura++) {
    const quase = barra(largura * 100 - 1, largura * 100, { color: false, largura })
    expect(visibleLen(quase)).toBe(largura)
    expect(quase.endsWith('░')).toBe(true)
    expect(barra(largura, largura, { color: false, largura })).toBe('█'.repeat(largura))
  }
})

test('uso nao-zero sempre marca ao menos uma coluna', () => {
  const o = { color: false, largura: 10, mostrarPercentual: true }
  expect(barra(1, 100, o)).toBe('█' + '░'.repeat(9) + '   1%')
  expect(barra(0, 100, o)).toBe('░'.repeat(10) + '   0%')
  expect(barra(0.001, 1000, o)).toBe('█' + '░'.repeat(9) + '   0%')
})

test('percentual so chega a 100% na saturacao real', () => {
  const o = { color: false, largura: 10, mostrarPercentual: true }
  expect(barra(999, 1000, o)).toBe('█'.repeat(9) + '░' + '  99%')
  expect(barra(1000, 1000, o)).toBe('█'.repeat(10) + ' 100%')
  expect(barra(4000, 1000, o)).toBe('█'.repeat(10) + ' 100%')
})

test('largura 1: coluna cheia so na saturacao', () => {
  const o = { color: false, largura: 1 }
  expect(barra(0, 10, o)).toBe('░')
  expect(barra(5, 10, o)).toBe('░')
  expect(barra(10, 10, o)).toBe('█')
})

test('total=0 nao divide por zero: barra vazia e 0%', () => {
  expect(barra(5, 0, CRU)).toBe('░'.repeat(18))
  expect(barra(0, 0, COM_PERCENTUAL)).toBe('░'.repeat(18) + '   0%')
  expect(barra(5, 0, COM_PERCENTUAL)).not.toContain('NaN')
  expect(severidadeDe(0)).toBe('ok')
})

test('valor negativo conta como zero', () => {
  expect(barra(-42, 18, CRU)).toBe('░'.repeat(18))
  expect(barra(-42, 18, COM_PERCENTUAL)).toBe('░'.repeat(18) + '   0%')
})

test('valor acima do total satura em 100% sem estourar a largura', () => {
  expect(barra(999, 18, COM_PERCENTUAL)).toBe('█'.repeat(18) + ' 100%')
  expect(visibleLen(barra(999, 18, COLORIDO))).toBe(18)
})

test('severidade entra na faixa a partir do limite, como em serie.ts', () => {
  expect(severidadeDe(0)).toBe('ok')
  expect(severidadeDe(0.599999)).toBe('ok')
  expect(severidadeDe(0.6)).toBe('atencao')
  expect(severidadeDe(0.849999)).toBe('atencao')
  expect(severidadeDe(0.85)).toBe('critico')
  expect(severidadeDe(1)).toBe('critico')
})

test('severidade nao explode com NaN nem com fracao negativa', () => {
  expect(severidadeDe(NaN)).toBe('ok')
  expect(severidadeDe(-3)).toBe('ok')
})

test('cor segue a severidade e so aparece com color=true', () => {
  expect(barra(1, 10, COLORIDO)).toContain('\x1b[32m')
  expect(barra(6, 10, COLORIDO)).toContain('\x1b[33m')
  expect(barra(7, 10, COLORIDO)).toContain('\x1b[33m')
  expect(barra(85, 100, COLORIDO)).toContain('\x1b[31m')
  expect(barra(9, 10, COLORIDO)).toContain('\x1b[31m')
  expect(barra(9, 10, CRU)).not.toMatch(ANSI)
})

test('com color=false nenhuma saida tem escape ANSI', () => {
  const saidas = [
    barra(0, 0, CRU),
    barra(-1, 10, COM_PERCENTUAL),
    barra(5, 10, COM_PERCENTUAL),
    barra(99, 10, COM_PERCENTUAL),
    barraRotulada('claude', 6, 10, { ...COM_PERCENTUAL, rotuloEm: 8 }),
    barraRotulada('provedor-de-nome-comprido', 6, 10, { ...COM_PERCENTUAL, rotuloEm: 8 }),
  ]
  for (const s of saidas) expect(s).not.toMatch(ANSI)
})

test('com color=true a saida crua bate com a colorida', () => {
  for (const valor of [0, 3, 6, 9, 10, 40]) {
    const cor = barra(valor, 10, { ...COLORIDO, mostrarPercentual: true })
    const cru = barra(valor, 10, { ...CRU, mostrarPercentual: true })
    expect(stripAnsi(cor)).toBe(cru)
  }
})

test('barraRotulada alinha o rotulo em rotuloEm colunas', () => {
  const o = { color: false, largura: 10, mostrarPercentual: true, rotuloEm: 8 }
  expect(barraRotulada('claude', 62, 100, o)).toBe('claude   ██████░░░░  62%')
  expect(barraRotulada('codex', 62, 100, o)).toBe('codex    ██████░░░░  62%')
})

test('barraRotulada mantem largura visivel constante mesmo com rotulo longo', () => {
  const o = { color: true, largura: 12, mostrarPercentual: true, rotuloEm: 6 }
  const larguras = new Set<number>()
  for (const rotulo of ['a', 'claude', 'ollama-local-70b', '']) {
    for (const valor of [0, 4, 8, 12, 99]) {
      larguras.add(visibleLen(barraRotulada(rotulo, valor, 12, o)))
    }
  }
  expect([...larguras]).toEqual([6 + 1 + 12 + 1 + 4])
})

test('rotuloEm zero ou invalido devolve so o medidor', () => {
  expect(barraRotulada('claude', 5, 10, { ...CRU, rotuloEm: 0 })).toBe(barra(5, 10, CRU))
  expect(barraRotulada('claude', 5, 10, { ...CRU, rotuloEm: -4 })).toBe(barra(5, 10, CRU))
})

test('largura zero ou negativa nao explode', () => {
  expect(barra(5, 10, { color: false, largura: 0 })).toBe('')
  expect(barra(5, 10, { color: false, largura: -3, mostrarPercentual: true })).toBe('  50%')
})

test('largura nao finita nao explode', () => {
  expect(barra(1, 2, { color: false, largura: Infinity })).toBe('')
  expect(barra(1, 2, { color: false, largura: NaN, mostrarPercentual: true })).toBe('  50%')
  expect(barraRotulada('claude', 1, 2, { color: false, largura: Infinity, rotuloEm: Infinity })).toBe('')
})

test('largura fracionaria usa so as colunas inteiras', () => {
  expect(visibleLen(barra(5, 10, { color: false, largura: 10.9 }))).toBe(10)
  expect(barra(10, 10, { color: false, largura: 3.9 })).toBe('███')
})

test('total negativo conta como sem quota', () => {
  expect(barra(5, -10, COM_PERCENTUAL)).toBe('░'.repeat(18) + '   0%')
})

test('valor ou total nao finito nao vaza NaN nem quebra a largura', () => {
  const o = { color: false, largura: 12, mostrarPercentual: true }
  const casos: [number, number][] = [
    [Infinity, Infinity], [Infinity, 10], [10, Infinity],
    [NaN, 10], [10, NaN], [NaN, NaN], [-Infinity, 10],
  ]
  for (const [valor, total] of casos) {
    const s = barra(valor, total, o)
    expect(s).not.toContain('NaN')
    expect(visibleLen(s)).toBe(12 + 1 + 4)
    expect(s).not.toMatch(ANSI)
  }
})

test('barraRotulada colorida bate com a crua depois de stripAnsi', () => {
  const base = { largura: 10, mostrarPercentual: true, rotuloEm: 8 }
  for (const rotulo of ['claude', 'ollama-local-70b', '']) {
    for (const valor of [0, 1, 6, 10, 99]) {
      const cor = barraRotulada(rotulo, valor, 10, { ...base, color: true })
      const cru = barraRotulada(rotulo, valor, 10, { ...base, color: false })
      expect(stripAnsi(cor)).toBe(cru)
      expect(cru).not.toMatch(ANSI)
    }
  }
})
