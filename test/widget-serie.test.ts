import { test, expect } from 'bun:test'
import { serie, esparklinha, type OpcoesSerie } from '../lib/core/render/widget/serie'
import { severidadeDe, type Severidade } from '../lib/core/render/widget/barra'
import { visibleLen, stripAnsi } from '../lib/core/tui/layout'

const semCor = (largura: number, altura: number): OpcoesSerie => ({ color: false, largura, altura })
const comCor = (largura: number, altura: number): OpcoesSerie => ({ color: true, largura, altura })

const ESCAPE_DA_SEVERIDADE: Record<Severidade, string> = {
  ok: '\x1b[32m',
  atencao: '\x1b[33m',
  critico: '\x1b[31m',
}

const rampa = [1, 2, 3, 4, 5, 6, 7, 8]

test('devolve exatamente altura linhas, para qualquer entrada', () => {
  const entradas: number[][] = [[], [0], [5], [-3, 7], rampa, Array.from({ length: 500 }, (_, i) => i)]
  for (const valores of entradas) {
    for (const altura of [1, 2, 3, 5, 8, 12]) {
      expect(serie(valores, semCor(20, altura))).toHaveLength(altura)
    }
  }
})

test('largura visivel constante em toda linha, com e sem cor', () => {
  for (const largura of [1, 2, 7, 20, 61]) {
    for (const o of [semCor(largura, 4), comCor(largura, 4)]) {
      for (const linha of serie([3, 0, 9, 1, 12, 4], o)) expect(visibleLen(linha)).toBe(largura)
    }
  }
})

test('serie vazia devolve altura linhas em branco e nao quebra', () => {
  const linhas = serie([], semCor(10, 3))
  expect(linhas).toHaveLength(3)
  expect(linhas).toEqual(['          ', '          ', '          '])
  expect(linhas.every(l => l.trim() === '')).toBe(true)
})

test('todos os valores iguais nao divide por zero e enche todas as colunas', () => {
  expect(serie([7, 7, 7], semCor(3, 3))).toEqual(['███', '███', '███'])
})

test('todos zero nao divide por zero e fica em branco', () => {
  expect(serie([0, 0, 0, 0], semCor(4, 2))).toEqual(['    ', '    '])
  expect(esparklinha([0, 0, 0, 0], 4)).toBe('    ')
})

test('um unico valor ocupa a coluna inteira em toda a altura', () => {
  expect(serie([42], semCor(1, 3))).toEqual(['█', '█', '█'])
})

test('valor negativo e tratado como 0, nao como minimo da escala', () => {
  expect(serie([-5, 10], semCor(2, 1))).toEqual([' █'])
  expect(serie([-1, -2, -3], semCor(3, 2))).toEqual(['   ', '   '])
  expect(esparklinha([-5, 10], 2)).toBe(' █')
})

test('largura 1 funciona: agrega tudo numa coluna so', () => {
  expect(serie([1, 2, 3], semCor(1, 1))).toEqual(['█'])
  expect(serie([], semCor(1, 2))).toEqual([' ', ' '])
  expect(esparklinha([1, 2, 3], 1)).toBe('█')
})

test('valores.length > largura agrega por MEDIA em baldes, nao por maximo', () => {
  expect(serie([0, 4, 8, 12], semCor(2, 1))).toEqual(['▂█'])
  expect(esparklinha([0, 4, 8, 12], 2)).toBe('▂█')
})

test('agregacao cobre todos os valores, inclusive muitos numa largura pequena', () => {
  expect(serie([0, 0, 0, 0, 10, 10, 10, 10], semCor(2, 1))).toEqual([' █'])
  expect(visibleLen(esparklinha(Array.from({ length: 1000 }, (_, i) => i), 30))).toBe(30)
})

test('valores.length < largura alinha a DIREITA: o presente fica na borda direita', () => {
  const linha = serie([5], semCor(4, 1))[0] ?? ''
  expect(linha).toBe('   █')
  expect(linha.endsWith('█')).toBe(true)
  expect(esparklinha([5], 4)).toBe('   █')
})

test('alinhamento a direita preserva a ordem da serie', () => {
  expect(esparklinha([8, 4], 5)).toBe('   █▄')
})

test('escala vertical pelo maximo: a linha de cima so acende no pico', () => {
  const linhas = serie(rampa, semCor(8, 2))
  expect(linhas).toEqual(['    ▂▄▆█', '▂▄▆█████'])
})

test('sem ANSI algum quando color=false', () => {
  const casos: number[][] = [[], [0], [-2, 90], rampa, [1, 1, 1]]
  for (const valores of casos) {
    for (const linha of serie(valores, semCor(12, 4))) {
      expect(linha).toBe(stripAnsi(linha))
      expect(linha).not.toContain('\x1b')
    }
    expect(esparklinha(valores, 12)).not.toContain('\x1b')
  }
})

test('com color=true pinta por severidade: verde ok, amarelo atencao, vermelho critico', () => {
  const linha = serie([10, 70, 100], comCor(3, 1))[0] ?? ''
  expect(stripAnsi(linha)).toBe('▁▆█')
  expect(linha).toContain('\x1b[32m')
  expect(linha).toContain('\x1b[33m')
  expect(linha).toContain('\x1b[31m')
  expect(linha.indexOf('\x1b[32m')).toBeLessThan(linha.indexOf('\x1b[31m'))
})

test('celula em branco nao carrega escape de cor', () => {
  const linha = serie([0, 0, 0], comCor(3, 1))[0] ?? ''
  expect(linha).toBe('   ')
})

test('esparklinha usa os blocos parciais em uma linha so', () => {
  const linha = esparklinha(rampa, 8)
  expect(linha).toBe('▁▂▃▄▅▆▇█')
  expect(linha.split('\n')).toHaveLength(1)
  expect(visibleLen(linha)).toBe(8)
})

test('esparklinha e a serie de altura 1 concordam', () => {
  expect(serie(rampa, semCor(8, 1))[0]).toBe(esparklinha(rampa, 8))
})

test('altura 0 devolve lista vazia e largura 0 devolve linhas vazias', () => {
  expect(serie(rampa, semCor(10, 0))).toEqual([])
  expect(serie(rampa, semCor(0, 2))).toEqual(['', ''])
  expect(esparklinha(rampa, 0)).toBe('')
})

test('NaN e Infinity nao vazam para a tela', () => {
  const linhas = serie([NaN, Infinity, 5], semCor(3, 2))
  for (const l of linhas) expect(visibleLen(l)).toBe(3)
  expect(linhas.join('')).not.toContain('N')
})

test('largura nao finita degenera em linha vazia em vez de estourar', () => {
  for (const ruim of [NaN, Infinity, -Infinity]) {
    expect(serie(rampa, semCor(ruim, 3))).toEqual(['', '', ''])
    expect(serie([], semCor(ruim, 2))).toEqual(['', ''])
    expect(esparklinha(rampa, ruim)).toBe('')
  }
})

test('altura nao finita devolve lista vazia em vez de laco infinito', () => {
  for (const ruim of [NaN, Infinity, -Infinity]) {
    expect(serie(rampa, semCor(8, ruim))).toEqual([])
  }
})

test('dimensao fracionaria trunca para baixo', () => {
  expect(serie(rampa, semCor(8, 2.9))).toHaveLength(2)
  for (const linha of serie(rampa, semCor(4.9, 2))) expect(visibleLen(linha)).toBe(4)
  expect(visibleLen(esparklinha(rampa, 4.9))).toBe(4)
})

test('a escala de severidade e a compartilhada com o widget barra, nao uma copia local', () => {
  const pares: Array<[number, number]> = [[1, 20], [1, 2], [3, 5], [61, 100], [17, 20], [86, 100], [1, 1]]
  for (const [numerador, denominador] of pares) {
    const linha = serie([numerador, denominador], comCor(2, 1))[0] ?? ''
    const esperada = ESCAPE_DA_SEVERIDADE[severidadeDe(numerador / denominador)]
    expect(stripAnsi(linha)).toHaveLength(2)
    expect(linha.startsWith(esperada)).toBe(true)
  }
})
