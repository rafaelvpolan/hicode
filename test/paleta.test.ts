import { test, expect } from 'bun:test'
import { profundidadeDeCor, pintar, tom, rampa, interpolar, corDoCubo, rgbDoTom, CANTO } from '../lib/core/tui/paleta'
import { barraGradiente, ondaDeEspera, pulso, quadroDoPulso } from '../lib/core/tui/carregando'
import { visibleLen, stripAnsi } from '../lib/core/tui/layout'

const cor = { color: true, profundidade: 'truecolor' as const }
const semCor = { color: false }

test('NO_COLOR vence tudo, inclusive terminal capaz', () => {
  expect(profundidadeDeCor({ NO_COLOR: '1', COLORTERM: 'truecolor', WT_SESSION: 'x' })).toBe('nenhuma')
})

test('profundidade sai do ambiente, com forcado por cima', () => {
  expect(profundidadeDeCor({ COLORTERM: 'truecolor' })).toBe('truecolor')
  expect(profundidadeDeCor({ WT_SESSION: '1', TERM: 'xterm-256color' })).toBe('truecolor')
  expect(profundidadeDeCor({ TERM: 'xterm-256color' })).toBe('256')
  expect(profundidadeDeCor({ TERM: 'xterm' })).toBe('basico')
  expect(profundidadeDeCor({ TERM: 'dumb' })).toBe('nenhuma')
  expect(profundidadeDeCor({})).toBe('nenhuma')
  expect(profundidadeDeCor({ HICODE_COLOR_DEPTH: 'basico', COLORTERM: 'truecolor' })).toBe('basico')
})

test('sem cor NENHUM tom emite escape — a garantia vale para todos', () => {
  for (const t of ['sucesso', 'atencao', 'falha', 'execucao', 'espera', 'custo', 'ocioso', 'destaque', 'apagado', 'texto'] as const) {
    expect(tom(t, semCor)).toBe('')
    const pintado = pintar('abc', t, semCor)
    expect(pintado).toBe('abc')
    expect(pintado).toBe(stripAnsi(pintado))
  }
})

test('pintar nao muda a largura VISIVEL do texto', () => {
  for (const t of ['sucesso', 'falha', 'custo'] as const) {
    expect(visibleLen(pintar('erro 500', t, cor))).toBe(8)
  }
})

test('cada tom tem cor propria — psicologia so funciona se nao colidirem', () => {
  const vistos = new Set(['sucesso', 'atencao', 'falha', 'execucao', 'espera', 'custo', 'ocioso'].map(t => {
    const c = rgbDoTom(t as Parameters<typeof rgbDoTom>[0])
    return `${c.r},${c.g},${c.b}`
  }))
  expect(vistos.size).toBe(7)
})

test('interpolar respeita as pontas e satura fora do intervalo', () => {
  const a = { r: 0, g: 0, b: 0 }
  const b = { r: 100, g: 200, b: 50 }
  expect(interpolar(a, b, 0)).toEqual(a)
  expect(interpolar(a, b, 1)).toEqual(b)
  expect(interpolar(a, b, -3)).toEqual(a)
  expect(interpolar(a, b, 9)).toEqual(b)
  expect(interpolar(a, b, 0.5)).toEqual({ r: 50, g: 100, b: 25 })
})

test('rampa comeca e termina nos tons pedidos, e 1 passo nao quebra', () => {
  const r = rampa('execucao', 'sucesso', 10)
  expect(r).toHaveLength(10)
  expect(r[0]).toEqual(rgbDoTom('execucao'))
  expect(r[9]).toEqual(rgbDoTom('sucesso'))
  expect(rampa('falha', 'sucesso', 1)).toHaveLength(1)
  expect(rampa('falha', 'sucesso', 0)).toHaveLength(1)
})

test('cor do cubo 256 fica na faixa valida', () => {
  for (const c of rampa('execucao', 'custo', 24)) {
    const i = corDoCubo(c)
    expect(i).toBeGreaterThanOrEqual(16)
    expect(i).toBeLessThanOrEqual(231)
  }
})

test('a barra de carregamento tem largura VISIVEL constante em toda fracao', () => {
  for (const largura of [1, 8, 20, 40]) {
    const vistos = new Set<number>()
    for (let f = 0; f <= 1.0001; f += 0.05) vistos.add(visibleLen(barraGradiente(f, { ...cor, largura })))
    expect([...vistos]).toEqual([largura])
  }
})

test('barra satura e nao estoura com fracao fora do intervalo', () => {
  expect(visibleLen(barraGradiente(-1, { ...cor, largura: 10 }))).toBe(10)
  expect(visibleLen(barraGradiente(5, { ...cor, largura: 10 }))).toBe(10)
  expect(stripAnsi(barraGradiente(1, { ...cor, largura: 6 }))).toBe('██████')
  expect(stripAnsi(barraGradiente(0, { ...cor, largura: 6 }))).toBe('░░░░░░')
})

test('sem cor a barra continua legivel e sem escape', () => {
  const b = barraGradiente(0.5, { color: false, largura: 10 })
  expect(b).toBe(stripAnsi(b))
  expect(visibleLen(b)).toBe(10)
})

test('o pulso cicla e e deterministico — mesmo tick, mesmo quadro', () => {
  expect(quadroDoPulso(0)).toBe(quadroDoPulso(10))
  expect(quadroDoPulso(3)).toBe(quadroDoPulso(13))
  expect(quadroDoPulso(-1)).toBeTruthy()
  expect(visibleLen(pulso(4, { ...cor, largura: 1 }))).toBe(1)
  expect(pulso(4, { color: false, largura: 1 })).toBe(quadroDoPulso(4))
})

test('a onda de espera mantem a largura e move o foco', () => {
  const largura = 20
  for (const t of [0, 5, 11, 19, 40]) {
    expect(visibleLen(ondaDeEspera(t, { ...cor, largura }))).toBe(largura)
  }
  expect(ondaDeEspera(0, { ...cor, largura })).not.toBe(ondaDeEspera(7, { ...cor, largura }))
})

test('os cantos sao arredondados e cada um e um caractere de uma coluna', () => {
  for (const c of [CANTO.supEsq, CANTO.supDir, CANTO.infEsq, CANTO.infDir]) {
    expect(visibleLen(c)).toBe(1)
  }
  expect(CANTO.supEsq).toBe('╭')
  expect(CANTO.infDir).toBe('╯')
})
