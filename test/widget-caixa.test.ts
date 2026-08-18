import { test, expect } from 'bun:test'
import { caixa, lado, grade, larguraDoBloco } from '../lib/core/render/widget/caixa'
import { visibleLen } from '../lib/core/tui/layout'

const semCor = { color: false }
const comCor = { color: true }

function larguras(bloco: string[]): number[] {
  return [...new Set(bloco.map(visibleLen))]
}

function temAnsi(bloco: string[]): boolean {
  return bloco.some(l => l.includes('\x1b'))
}

test('caixa: titulo embutido na borda de cima e toda linha com a largura exata', () => {
  const b = caixa('CPU', ['carga 12%', 'temp 44C'], { ...semCor, largura: 20 })
  expect(b[0]).toBe(`┌─ CPU ${'─'.repeat(12)}┐`)
  expect(b[1]).toBe(`│carga 12%${' '.repeat(9)}│`)
  expect(b[3]).toBe(`└${'─'.repeat(18)}┘`)
  expect(larguras(b)).toEqual([20])
})

test('caixa: sem cor a saida nao tem NENHUM escape ANSI, nem vindo do corpo ou do titulo', () => {
  const b = caixa('\x1b[1mCPU\x1b[0m', ['\x1b[31mcritico\x1b[0m'], { ...semCor, largura: 24 })
  expect(temAnsi(b)).toBe(false)
  expect(b[0]).toBe(`┌─ CPU ${'─'.repeat(16)}┐`)
  expect(b[1]).toBe(`│critico${' '.repeat(15)}│`)
  expect(larguras(b)).toEqual([24])
})

test('caixa: corpo com ANSI mede pela largura visivel, nao por String.length', () => {
  const pintado = '\x1b[32mok\x1b[0m'
  const b = caixa('MEM', [pintado], { ...comCor, largura: 16 })
  expect(larguras(b)).toEqual([16])
  expect(b[1]).toContain(pintado)
  expect(b[1]!.length).toBeGreaterThan(16)
})

test('caixa: titulo maior que a caixa e truncado sem estourar a moldura', () => {
  const b = caixa('TITULO ABSURDAMENTE LONGO DEMAIS', ['x'], { ...semCor, largura: 14 })
  expect(larguras(b)).toEqual([14])
  expect(b[0]).toStartWith('┌─ ')
  expect(b[0]).toEndWith('┐')
  expect(b[0]).toContain('…')
})

test('caixa: corpo mais largo e truncado, mais curto e preenchido', () => {
  const b = caixa('T', ['linha muito comprida para caber', ''], { ...semCor, largura: 12 })
  expect(larguras(b)).toEqual([12])
  expect(b[1]).toBe('│linha mui…│')
  expect(b[2]).toBe(`│${' '.repeat(10)}│`)
})

test('caixa: largura absurda (5) nao gera moldura negativa e derruba o titulo', () => {
  for (const largura of [5, 4, 1, 0, -30]) {
    const b = caixa('CPU', ['carga'], { ...semCor, largura })
    expect(larguras(b)).toEqual([Math.max(4, largura)])
    expect(b[0]).toStartWith('┌')
    expect(b[0]).toEndWith('┐')
    expect(b[2]).toStartWith('└')
  }
  expect(caixa('CPU', [], { ...semCor, largura: 5 })[0]).toBe('┌───┐')
  expect(caixa('CPU', [], { ...semCor, largura: 6 })[0]).toBe('┌─ … ┐')
})

test('caixa: corpo exatamente do tamanho interno nao ganha reticencia, um a mais ganha', () => {
  const exato = caixa('T', ['abcdefghij'], { ...semCor, largura: 12 })
  expect(exato[1]).toBe('│abcdefghij│')
  const passou = caixa('T', ['abcdefghijk'], { ...semCor, largura: 12 })
  expect(passou[1]).toBe('│abcdefghi…│')
  expect(larguras(exato)).toEqual([12])
  expect(larguras(passou)).toEqual([12])
})

test('caixa: titulo vazio ou so espacos vira moldura continua sem rotulo', () => {
  for (const titulo of ['', '   ']) {
    const b = caixa(titulo, ['x'], { ...semCor, largura: 10 })
    expect(b[0]).toBe(`┌${'─'.repeat(8)}┐`)
    expect(larguras(b)).toEqual([10])
  }
  expect(temAnsi(caixa('', ['x'], { ...comCor, largura: 10 }))).toBe(true)
})

test('caixa: quebra de linha e tab no corpo nao arrebentam a moldura', () => {
  const b = caixa('T', ['a\nb', 'c\td'], { ...semCor, largura: 12 })
  expect(b.join('\n').split('\n')).toHaveLength(4)
  expect(b[1]).toBe('│a b       │')
  expect(b[2]).toBe('│c d       │')
  expect(larguras(b)).toEqual([12])
})

test('caixa: retorno de carro do corpo nao volta o cursor por cima da borda', () => {
  const b = caixa('OUT', ['baixando 40%\rbaixando 90%'], { ...semCor, largura: 20 })
  expect(b.some(l => /[\x00-\x08\x0b-\x1f\x7f]/.test(l))).toBe(false)
  expect(larguras(b)).toEqual([20])
})

test('caixa: titulo com quebra de linha nao parte a borda de cima em duas', () => {
  const b = caixa('A\nB', ['x'], { ...semCor, largura: 20 })
  expect(b[0]).toBe(`┌─ A B ${'─'.repeat(12)}┐`)
  expect(larguras(b)).toEqual([20])
})

test('caixa: com cor, controle que nao e escape ANSI sai fora mas a tinta fica', () => {
  const b = caixa('CPU', ['\x1b[31mred\x07bell'], { ...comCor, largura: 20 })
  expect(b[1]).toContain('\x1b[31m')
  expect(b[1]).not.toContain('\x07')
  expect(larguras(b)).toEqual([20])
})

test('caixa: largura NaN cai no minimo defensivo em vez de propagar NaN', () => {
  const b = caixa('X', ['y'], { ...semCor, largura: Number.NaN })
  expect(larguras(b)).toEqual([4])
})

test('caixa: com cor o corpo termina em reset para a moldura nao herdar a tinta', () => {
  const b = caixa('CPU', ['\x1b[31mvermelho'], { ...comCor, largura: 20 })
  expect(b[1]).toContain('\x1b[0m\x1b[2m│')
  expect(larguras(b)).toEqual([20])
})

test('lado: alturas diferentes terminam na mesma altura, o mais curto vira vazio da largura certa', () => {
  const esquerda = caixa('A', ['1', '2', '3'], { ...semCor, largura: 10 })
  const direita = caixa('B', ['9'], { ...semCor, largura: 8 })
  const j = lado(esquerda, direita)
  expect(j).toHaveLength(esquerda.length)
  expect(larguras(j)).toEqual([18])
  expect(j[0]).toBe('┌─ A ────┐┌─ B ──┐')
  expect(j[4]).toBe('└────────┘        ')
})

test('lado: bloco maior a direita tambem preenche a esquerda', () => {
  const j = lado(['ab'], ['xyz', 'xyz', 'xyz'])
  expect(j).toEqual(['abxyz', '  xyz', '  xyz'])
  expect(larguras(j)).toEqual([5])
})

test('lado: blocos vazios nao explodem', () => {
  expect(lado([], [])).toEqual([])
  expect(lado([], ['a'])).toEqual(['a'])
  expect(temAnsi(lado(['a'], ['b']))).toBe(false)
})

test('lado: largura do bloco vem do maior visivel ignorando ANSI', () => {
  expect(larguraDoBloco(['\x1b[31mabc\x1b[0m', 'ab'])).toBe(3)
  const j = lado(['\x1b[31mabc\x1b[0m', 'ab'], ['z'])
  expect(larguras(j)).toEqual([4])
})

test('grade: N blocos em linhas de `colunas`, dividindo a largura e devolvendo um bloco unico', () => {
  const bloco = (t: string): string[] => caixa(t, [t.toLowerCase()], { ...semCor, largura: 20 })
  const g = grade([bloco('A'), bloco('B'), bloco('C'), bloco('D')], { largura: 40, colunas: 2 })
  expect(larguras(g)).toEqual([40])
  expect(g).toHaveLength(6)
  expect(g[0]).toBe(`┌─ A ${'─'.repeat(14)}┐┌─ B ${'─'.repeat(14)}┐`)
  expect(g[1]).toBe(`│a${' '.repeat(17)}││b${' '.repeat(17)}│`)
  expect(g[3]).toStartWith('┌─ C ')
  expect(temAnsi(g)).toBe(false)
})

test('grade: bloco pre-renderizado mais largo que a coluna e truncado, nunca estoura a fila', () => {
  const largo = caixa('A', ['a'], { ...semCor, largura: 60 })
  const g = grade([largo, largo], { largura: 40, colunas: 2 })
  expect(larguras(g)).toEqual([40])
  expect(g[0]).toBe('┌─ A ──────────────…┌─ A ──────────────…')
})

test('grade: largura indivisivel distribui o resto nas primeiras colunas sem sobra', () => {
  const g = grade([['a'], ['b'], ['c']], { largura: 20, colunas: 3 })
  expect(larguras(g)).toEqual([20])
  expect(g[0]).toBe('a      b      c     ')
})

test('grade: ultima fila incompleta e preenchida ate a largura total', () => {
  const g = grade([['a'], ['b'], ['c']], { largura: 12, colunas: 2 })
  expect(g).toEqual(['a     b     ', 'c           '])
  expect(larguras(g)).toEqual([12])
})

test('grade: coluna estreita trunca em vez de estourar a largura', () => {
  const g = grade([['muito comprido'], ['outro']], { largura: 4, colunas: 2 })
  expect(larguras(g)).toEqual([4])
})

test('grade: uma coluna, blocos de alturas diferentes e lista vazia', () => {
  const g = grade([['a', 'b'], ['c']], { largura: 6, colunas: 1 })
  expect(g).toEqual(['a     ', 'b     ', 'c     '])
  expect(grade([], { largura: 10, colunas: 3 })).toEqual([])
})

test('grade: colunas/largura degeneradas ficam na largura pedida, nunca acima', () => {
  for (const o of [{ largura: 0, colunas: 0 }, { largura: -5, colunas: 2 }, { largura: Number.NaN, colunas: 2 }]) {
    const g = grade([['x'], ['y']], o)
    expect(larguras(g)).toEqual([1])
  }
})

test('grade: mais colunas que colunas de terminal nao estoura a largura pedida', () => {
  for (const largura of [1, 2, 4, 7]) {
    for (const colunas of [1, 2, 3, 8]) {
      const g = grade([['ab'], ['cd'], ['ef']], { largura, colunas })
      expect(larguras(g)).toEqual([largura])
    }
  }
})

test('grade de caixas com cor mantem a largura visivel uniforme', () => {
  const a = caixa('\x1b[1mA\x1b[0m', ['\x1b[32mok\x1b[0m'], { ...comCor, largura: 30 })
  const b = caixa('B', ['\x1b[31mfalha\x1b[0m'], { ...comCor, largura: 30 })
  const g = grade([a, b], { largura: 30, colunas: 2 })
  expect(larguras(g)).toEqual([30])
  expect(temAnsi(g)).toBe(true)
})
