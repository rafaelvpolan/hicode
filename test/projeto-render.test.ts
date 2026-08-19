import { test, expect } from 'bun:test'
import { etiquetaDoProjeto, corDoProjeto, nomeCurto, CORES_DE_PROJETO } from '../lib/core/render/projeto'
import { renderFrame, stripAnsi, visibleLen } from '../lib/core/tui/layout'
import { CANTO } from '../lib/core/tui/paleta'

test('mostra o nome curto em destaque e o dono discreto', () => {
  const t = etiquetaDoProjeto('rafaelvpolan/hicode-site')
  expect(t).toContain('hicode-site')
  expect(t).toContain('rafaelvpolan')
})

test('sem projeto, ensina como escolher', () => {
  expect(stripAnsi(etiquetaDoProjeto(''))).toContain('/repo')
})

test('cada projeto tem cor propria, e sempre a mesma', () => {
  const a = corDoProjeto('org/site')
  expect(corDoProjeto('org/site')).toBe(a)
  expect(CORES_DE_PROJETO).toContain(a)
})

test('projetos diferentes tendem a cores diferentes', () => {
  const cores = new Set(['org/site', 'org/api', 'org/app'].map((r, i) => corDoProjeto(r, i)))
  expect(cores.size).toBe(3)
})

test('indice fora da paleta da a volta em vez de quebrar', () => {
  expect(CORES_DE_PROJETO).toContain(corDoProjeto('x', 99))
})

test('nome curto tira o owner', () => {
  expect(nomeCurto('org/site')).toBe('site')
  expect(nomeCurto('sem-barra')).toBe('sem-barra')
})

test('detalhe extra aparece ao lado', () => {
  expect(stripAnsi(etiquetaDoProjeto('org/site', { detalhe: 'tarefa #22' }))).toContain('tarefa #22')
})

test('sem cor nao emite escape ANSI', () => {
  expect(etiquetaDoProjeto('org/site', { color: false })).not.toContain('\x1b[')
})

test('area do prompt vira um quadro com legenda', () => {
  const f = renderFrame({
    rows: 16, cols: 60, header: 'hii', corpo: ['x'], input: 'tarefa', cursor: 6,
    dica: '', prompt: '› ', rodape: [], legenda: '● hicode-site',
  })
  const texto = f.lines.map(stripAnsi)
  const topo = texto.findIndex(l => l.includes('● hicode-site'))
  const entrada = texto.findIndex(l => l.includes('› tarefa'))
  expect(topo).toBeGreaterThan(0)
  expect(topo).toBeLessThan(entrada)
  expect(texto[entrada]?.trimStart().startsWith('│')).toBe(true)
  expect(texto[entrada + 1]).toContain(`${CANTO.infEsq}`)
})

test('o cursor continua certo dentro do quadro do prompt', () => {
  const f = renderFrame({
    rows: 16, cols: 60, header: 'h', corpo: [], input: 'abc', cursor: 3,
    dica: '', prompt: '› ', rodape: [], legenda: 'proj',
  })
  const linha = stripAnsi(f.lines[f.cursorRow - 1] ?? '')
  expect(linha).toContain('abc')
  expect(linha[f.cursorCol - 1]).toBe(' ')
  expect(linha.slice(0, f.cursorCol - 1)).toContain('abc')
})

test('quadro do prompt nao desalinha as linhas', () => {
  const f = renderFrame({
    rows: 16, cols: 58, header: 'h', corpo: ['a'], input: 'x', cursor: 1,
    dica: '/help', prompt: '› ', rodape: ['ia claude'], legenda: '● site',
  })
  expect(new Set(f.lines.map(l => visibleLen(l))).size).toBe(1)
})

test('sem legenda, o prompt continua sem moldura', () => {
  const f = renderFrame({
    rows: 16, cols: 58, header: 'h', corpo: ['a'], input: 'x', cursor: 1,
    dica: '', prompt: '› ', rodape: [],
  })
  const entrada = f.lines.map(stripAnsi).findIndex(l => l.includes('› x'))
  expect(f.lines.map(stripAnsi)[entrada]?.trimStart().startsWith('│')).toBe(false)
})

test('input multilinha cabe dentro do quadro', () => {
  const f = renderFrame({
    rows: 18, cols: 58, header: 'h', corpo: [], input: 'um\ndois', cursor: 6,
    dica: '', prompt: '› ', rodape: [], legenda: 'p',
  })
  const texto = f.lines.map(stripAnsi)
  expect(texto.filter(l => l.includes('um') || l.includes('dois')).every(l => l.trimStart().startsWith('│'))).toBe(true)
  expect(new Set(f.lines.map(l => visibleLen(l))).size).toBe(1)
})
