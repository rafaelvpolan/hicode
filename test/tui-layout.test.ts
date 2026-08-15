import { test, expect } from 'bun:test'
import { renderFrame, stripAnsi, visibleLen, truncVisible, padVisible } from '../lib/core/tui/layout'

const quadro = (over: Partial<Parameters<typeof renderFrame>[0]> = {}): ReturnType<typeof renderFrame> =>
  renderFrame({ rows: 10, cols: 40, header: 'hii', corpo: [], input: '', cursor: 0, dica: '', prompt: '› ', rodape: [], ...over })

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
  process.env.HICODE_HYPERLINKS = 'on'
  const t = linkificar('veja https://exemplo.com/x agora')
  expect(visibleLen(t)).toBe('veja https://exemplo.com/x agora'.length)
  expect(t).toContain('\x1b]8;;')
  delete process.env.HICODE_HYPERLINKS
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

test('rodape aparece abaixo do input, sem mover o cursor do input', () => {
  const f = quadro({ rows: 14, input: 'tarefa', cursor: 6, rodape: ['ia claude · esforco medium', '⠋ #021 rodando'] })
  const ultimas = f.lines.slice(-2).map(l => stripAnsi(l))
  expect(ultimas[0]).toContain('ia claude')
  expect(ultimas[1]).toContain('#021 rodando')
  expect(f.cursorRow).toBe(f.lines.length - 2)
})

test('rodape nao quebra o alinhamento do quadro', () => {
  const f = quadro({ rows: 14, cols: 58, rodape: ['linha curta', 'outra linha de rodape um pouco maior'] })
  expect(new Set(f.lines.map(l => visibleLen(l))).size).toBe(1)
})

test('rodape longo e truncado dentro da largura', () => {
  const f = quadro({ cols: 40, rodape: ['x'.repeat(200)] })
  expect(visibleLen(f.lines[f.lines.length - 1] ?? '')).toBe(40)
})

import { suportaLink } from '../lib/core/tui/layout'

test('REGRESSAO linkificar NAO embrulha url que ja esta dentro de um link', () => {
  process.env.HICODE_HYPERLINKS = 'on'
  const uma = link('http://localhost:5222')
  const duas = linkificar(uma)
  expect(duas).toBe(uma)
  expect(stripAnsi(duas)).toBe('http://localhost:5222')
  delete process.env.HICODE_HYPERLINKS
})

test('REGRESSAO linha do plano com link nao repete a url', () => {
  process.env.HICODE_HYPERLINKS = 'on'
  const linha = `    Preview    ${link('http://localhost:5222')}  sobe quando executar`
  const visivel = stripAnsi(linkificar(linha))
  expect(visivel.match(/localhost:5222/g)?.length).toBe(1)
  expect(visivel).not.toContain(']8;;')
  delete process.env.HICODE_HYPERLINKS
})

test('terminal sem suporte recebe texto puro, sem escape de link', () => {
  process.env.HICODE_HYPERLINKS = 'off'
  expect(link('http://x', 'texto')).toBe('texto')
  expect(linkificar('veja http://x aqui')).toBe('veja http://x aqui')
  delete process.env.HICODE_HYPERLINKS
})

test('deteccao por variavel de ambiente do terminal', () => {
  expect(suportaLink({ WT_SESSION: '1' })).toBe(true)
  expect(suportaLink({ TERM_PROGRAM: 'iTerm.app' })).toBe(true)
  expect(suportaLink({ TERM_PROGRAM: 'vscode' })).toBe(true)
  expect(suportaLink({ VTE_VERSION: '6003' })).toBe(true)
  expect(suportaLink({ VTE_VERSION: '4000' })).toBe(false)
  expect(suportaLink({})).toBe(false)
  expect(suportaLink({ HICODE_HYPERLINKS: 'off', WT_SESSION: '1' })).toBe(false)
})

test('url no meio de texto ainda vira link quando suportado', () => {
  process.env.HICODE_HYPERLINKS = 'on'
  const t = linkificar('preview → http://localhost:5222 agora')
  expect(t).toContain('\x1b]8;;http://localhost:5222')
  expect(visibleLen(t)).toBe('preview → http://localhost:5222 agora'.length)
  delete process.env.HICODE_HYPERLINKS
})

test('a dica fica ABAIXO do campo, em linha propria', () => {
  const f = quadro({ rows: 14, cols: 60, input: 'tarefa', dica: '↑/↓ para escolher · enter para ver' })
  const texto = f.lines.map(l => stripAnsi(l))
  const iInput = texto.findIndex(l => l.includes('› tarefa'))
  const iDica = texto.findIndex(l => l.includes('para escolher'))
  expect(iDica).toBe(iInput + 1)
})

test('a dica nao divide linha com o que voce digita', () => {
  const f = quadro({ rows: 14, cols: 60, input: 'tarefa', dica: 'uma dica' })
  const linha = stripAnsi(f.lines.find(l => stripAnsi(l).includes('› tarefa')) ?? '')
  expect(linha).not.toContain('uma dica')
})

test('a dica fica fora do quadro do prompt', () => {
  const f = renderFrame({
    rows: 16, cols: 60, header: 'h', corpo: ['x'], input: 'y', cursor: 1,
    dica: 'a dica', prompt: '› ', rodape: [], legenda: 'proj',
  })
  const texto = f.lines.map(l => stripAnsi(l))
  const iFecha = texto.findIndex(l => l.includes('└'))
  const iDica = texto.findIndex(l => l.includes('a dica'))
  expect(iDica).toBeGreaterThan(iFecha)
})

test('a dica nao move o cursor do campo', () => {
  const com = quadro({ rows: 14, cols: 60, input: 'abc', cursor: 3, dica: 'uma dica bem longa aqui' })
  const sem = quadro({ rows: 14, cols: 60, input: 'abc', cursor: 3, dica: '' })
  expect(com.cursorCol).toBe(sem.cursorCol)
  expect(stripAnsi(com.lines[com.cursorRow - 1] ?? '')).toContain('abc')
})

test('dica longa nao estoura a largura', () => {
  const f = quadro({ cols: 40, input: 'x', dica: 'd'.repeat(200) })
  expect(f.lines.every(l => visibleLen(l) === 40)).toBe(true)
})

test('a dica ocupa espaco do corpo, nao estica o quadro', () => {
  const corpo = Array.from({ length: 30 }, (_, i) => `linha ${i}`)
  const com = quadro({ rows: 14, cols: 60, corpo, input: 'x', dica: 'algo' })
  const sem = quadro({ rows: 14, cols: 60, corpo, input: 'x', dica: '' })
  expect(com.lines.length).toBe(sem.lines.length)
  const corpoDe = (f: typeof com): number => f.lines.filter(l => stripAnsi(l).includes('linha ')).length
  expect(corpoDe(com)).toBe(corpoDe(sem) - 1)
})

test('REGRESSAO nenhum teste pode depender do terminal de quem roda', () => {
  const guardado = { ...process.env }
  for (const v of ['WT_SESSION', 'TERM_PROGRAM', 'KITTY_WINDOW_ID', 'VTE_VERSION', 'GHOSTTY_RESOURCES_DIR']) {
    delete process.env[v]
  }
  delete process.env.HICODE_HYPERLINKS
  expect(suportaLink()).toBe(false)
  expect(link('http://x', 'texto')).toBe('texto')

  process.env.HICODE_HYPERLINKS = 'on'
  expect(link('http://x', 'texto')).toContain('\x1b]8;;')

  delete process.env.HICODE_HYPERLINKS
  Object.assign(process.env, guardado)
})
