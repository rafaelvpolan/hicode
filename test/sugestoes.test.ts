import { test, expect } from 'bun:test'
import { renderSugestoes, prefixoComum, AJUDA_DO_COMANDO } from '../lib/core/render/sugestoes'
import { renderFrame, visibleLen, stripAnsi } from '../lib/core/tui/layout'

test('cada comando vem com a descricao ao lado', () => {
  const t = renderSugestoes(['/rm', '/repo'], { width: 78 }).join('\n')
  expect(t).toContain('/rm')
  expect(t).toContain(AJUDA_DO_COMANDO['/rm'] ?? '')
  expect(t).toContain('/repo')
  expect(t).toContain(AJUDA_DO_COMANDO['/repo'] ?? '')
})

test('todos os comandos do catalogo tem descricao', async () => {
  const { COMMANDS } = await import('../lib/core/session')
  for (const c of COMMANDS) expect(AJUDA_DO_COMANDO[c], c).toBeTruthy()
})

test('descricoes alinham numa coluna so', () => {
  const linhas = renderSugestoes(['/ok', '/preview'], { width: 78 })
  const col = linhas.map(l => l.indexOf(AJUDA_DO_COMANDO['/ok'] ?? 'x'))
  const outra = linhas.map(l => l.indexOf(AJUDA_DO_COMANDO['/preview'] ?? 'y'))
  expect(Math.max(...col, ...outra)).toBeGreaterThan(0)
  expect(visibleLen(linhas[0] ?? '')).toBeLessThanOrEqual(78)
})

test('a opcao selecionada fica destacada', () => {
  const linhas = renderSugestoes(['/rm', '/repo'], { color: true, selecionado: 1 })
  expect(linhas[1]).toContain('\x1b[7m')
  expect(linhas[0]).not.toContain('\x1b[7m')
})

test('sem selecao, nenhuma fica destacada', () => {
  const linhas = renderSugestoes(['/rm', '/repo'], { color: true })
  expect(linhas.join('')).not.toContain('\x1b[7m')
})

test('mostra no maximo 6 e conta o resto', () => {
  const muitos = Array.from({ length: 10 }, (_, i) => `/cmd${i}`)
  const linhas = renderSugestoes(muitos, { width: 78 })
  expect(linhas.length).toBe(7)
  expect(linhas[6]).toContain('e mais 4')
})

test('lista vazia nao ocupa espaco', () => {
  expect(renderSugestoes([])).toEqual([])
})

test('cabe na largura, mesmo em terminal estreito', () => {
  for (const width of [30, 50, 78]) {
    for (const l of renderSugestoes(['/preview', '/rm'], { width })) {
      expect(visibleLen(l)).toBeLessThanOrEqual(width)
    }
  }
})

test('sem cor nao emite escape ANSI', () => {
  expect(renderSugestoes(['/rm'], { color: false }).join('')).not.toContain('\x1b[')
})

test('prefixo comum das opcoes', () => {
  expect(prefixoComum(['/repo', '/reject'])).toBe('/re')
  expect(prefixoComum(['/rm'])).toBe('/rm')
  expect(prefixoComum(['/rm', '/board'])).toBe('/')
  expect(prefixoComum([])).toBe('')
})

test('sugestoes ficam ACIMA da linha de digitacao', () => {
  const f = renderFrame({
    rows: 14, cols: 60, header: 'hii', corpo: ['x'], input: '/r', cursor: 2,
    dica: '', prompt: '› ', rodape: ['ia claude'], sugestoes: ['  /rm  apaga', '  /repo  troca'],
  })
  const texto = f.lines.map(stripAnsi)
  const iSug = texto.findIndex(l => l.includes('/rm  apaga'))
  const iInput = texto.findIndex(l => l.includes('› /r'))
  const iRodape = texto.findIndex(l => l.includes('ia claude'))
  expect(iSug).toBeLessThan(iInput)
  expect(iInput).toBeLessThan(iRodape)
})

test('sugestoes nao desalinham o quadro nem perdem o cursor', () => {
  const f = renderFrame({
    rows: 14, cols: 60, header: 'hii', corpo: ['x'], input: '/re', cursor: 3,
    dica: '', prompt: '› ', rodape: [], sugestoes: ['  /repo', '  /reject'],
  })
  expect(new Set(f.lines.map(l => visibleLen(l))).size).toBe(1)
  expect(f.cursorCol).toBe(3 + 2 + 3)
  expect(stripAnsi(f.lines[f.cursorRow - 1] ?? '')).toContain('/re')
})

test('comando digitado pode sair colorido sem mover o cursor', () => {
  const semCor = renderFrame({
    rows: 12, cols: 50, header: 'h', corpo: [], input: '/rm 23', cursor: 6,
    dica: '', prompt: '› ', rodape: [],
  })
  const comCor = renderFrame({
    rows: 12, cols: 50, header: 'h', corpo: [], input: '/rm 23', cursor: 6,
    dica: '', prompt: '› ', rodape: [], corInput: (l) => `\x1b[36m${l}\x1b[0m`,
  })
  expect(comCor.cursorCol).toBe(semCor.cursorCol)
  expect(comCor.cursorRow).toBe(semCor.cursorRow)
  expect(stripAnsi(comCor.lines[comCor.cursorRow - 1] ?? '')).toBe(stripAnsi(semCor.lines[semCor.cursorRow - 1] ?? ''))
})
