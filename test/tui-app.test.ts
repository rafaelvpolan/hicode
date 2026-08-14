import { test, expect } from 'bun:test'
import { createApp } from '../lib/core/tui/app'
import type { Terminal } from '../lib/core/tui/screen'
import { stripAnsi } from '../lib/core/tui/layout'

interface Fake extends Terminal {
  saida: string[]
  tecla: (k: string) => void
  raw: boolean[]
  tela: () => string
}

function fakeTerminal(rows = 12, cols = 50): Fake {
  const saida: string[] = []
  const raw: boolean[] = []
  let onKeyFn: ((k: string) => void) | null = null
  let onResizeFn: (() => void) | null = null
  return {
    saida, raw,
    write: (s) => { saida.push(s) },
    rows: () => rows,
    cols: () => cols,
    onResize: (fn) => { onResizeFn = fn },
    offResize: () => { onResizeFn = null },
    onKey: (fn) => { onKeyFn = fn },
    offKey: () => { onKeyFn = null },
    setRaw: (on) => { raw.push(on) },
    tecla: (k) => onKeyFn?.(k),
    tela: () => {
      const tudo = saida.join('')
      const i = tudo.lastIndexOf('\x1b[H')
      return stripAnsi(i >= 0 ? tudo.slice(i) : tudo)
    },
  }
}

function app(term: Fake, over: Partial<Parameters<typeof createApp>[1]> = {}): ReturnType<typeof createApp> {
  return createApp(term, {
    header: () => 'hii · org/app',
    corpo: () => ['#020 selo beta'],
    dica: () => '/help',
    prompt: () => '› ',
    onLine: () => {},
    onComplete: () => [],
    onInterrupt: () => true,
    onNav: () => false,
    onEntrar: () => {},
    podeLimpar: () => '',
    fixo: () => [],
    sugestoes: () => [],
    prefixoComum: () => '',
    rodape: () => [],
    intervalMs: 100000,
    ...over,
  })
}

test('abre em tela alternativa e liga o raw mode', () => {
  const t = fakeTerminal()
  void app(t).run()
  expect(t.saida.join('')).toContain('\x1b[?1049h')
  expect(t.raw[0]).toBe(true)
})

test('desenha cabecalho, corpo e prompt', () => {
  const t = fakeTerminal()
  void app(t).run()
  const tela = t.tela()
  expect(tela).toContain('hii · org/app')
  expect(tela).toContain('#020 selo beta')
  expect(tela).toContain('›')
})

test('o que voce digita aparece no input', () => {
  const t = fakeTerminal()
  void app(t).run()
  for (const c of 'selo') t.tecla(c)
  expect(t.tela()).toContain('selo')
})

test('enter chama onLine com a linha e ecoa no corpo', async () => {
  const t = fakeTerminal()
  const linhas: string[] = []
  void app(t, { onLine: (l) => { linhas.push(l) } }).run()
  for (const c of 'minha tarefa') t.tecla(c)
  t.tecla('\r')
  await Promise.resolve()
  expect(linhas).toEqual(['minha tarefa'])
  expect(t.tela()).toContain('› minha tarefa')
})

test('log entra no corpo e mantem o input intacto', () => {
  const t = fakeTerminal()
  const a = app(t)
  void a.run()
  for (const c of 'digitando') t.tecla(c)
  a.log('14:22 build exit=0')
  const tela = t.tela()
  expect(tela).toContain('build exit=0')
  expect(tela).toContain('digitando')
})

test('ctrl+c fecha quando o hook autoriza, restaurando a tela', () => {
  const t = fakeTerminal()
  void app(t).run()
  t.tecla('\x03')
  const s = t.saida.join('')
  expect(s).toContain('\x1b[?1049l')
  expect(t.raw[t.raw.length - 1]).toBe(false)
})

test('ctrl+c que o hook recusa nao fecha', () => {
  const t = fakeTerminal()
  void app(t, { onInterrupt: () => false }).run()
  t.tecla('\x03')
  expect(t.saida.join('')).not.toContain('\x1b[?1049l')
})

test('ctrl+d em linha vazia fecha', () => {
  const t = fakeTerminal()
  void app(t).run()
  t.tecla('\x04')
  expect(t.saida.join('')).toContain('\x1b[?1049l')
})

test('tab com uma opcao completa a linha', () => {
  const t = fakeTerminal()
  void app(t, { onComplete: () => ['/repo'] }).run()
  for (const c of '/re') t.tecla(c)
  t.tecla('\t')
  expect(t.tela()).toContain('/repo')
})

test('tab com varias opcoes completa ate o prefixo comum', () => {
  const t = fakeTerminal()
  void app(t, {
    onComplete: () => ['/repo', '/reject'],
    prefixoComum: () => '/re',
  }).run()
  t.tecla('/')
  t.tecla('\t')
  expect(t.tela()).toContain('/re')
})

test('tab de novo, ja no prefixo comum, cicla entre as opcoes', () => {
  const t = fakeTerminal()
  void app(t, {
    onComplete: () => ['/repo', '/reject'],
    prefixoComum: () => '/re',
  }).run()
  for (const c of '/re') t.tecla(c)
  t.tecla('\t')
  expect(t.tela()).toContain('/repo')
  t.tecla('\t')
  expect(t.tela()).toContain('/reject')
})

test('opcoes aparecem sozinhas ao digitar a barra, sem apertar tab', () => {
  const t = fakeTerminal()
  void app(t, {
    onComplete: () => ['/board', '/rm'],
    sugestoes: (opcoes) => opcoes.map(o => `  ${o}`),
  }).run()
  t.tecla('/')
  const tela = t.tela()
  expect(tela).toContain('/board')
  expect(tela).toContain('/rm')
})

test('texto que nao comeca com barra nao mostra sugestao', () => {
  const t = fakeTerminal()
  void app(t, {
    onComplete: () => ['/board'],
    sugestoes: (opcoes) => opcoes.map(o => `  ${o}`),
  }).run()
  for (const c of 'tarefa') t.tecla(c)
  expect(t.tela()).not.toContain('/board')
})

test('corpo longo nao estoura: mostra o fim', () => {
  const t = fakeTerminal(10, 40)
  const a = app(t, { corpo: () => [] })
  void a.run()
  for (let i = 0; i < 40; i++) a.log(`evento ${i}`)
  const tela = t.tela()
  expect(tela).toContain('evento 39')
  expect(tela.includes('evento 0')).toBe(false)
})

test('depois de fechar, tecla nao redesenha mais', () => {
  const t = fakeTerminal()
  void app(t).run()
  t.tecla('\x03')
  const antes = t.saida.length
  t.tecla('a')
  expect(t.saida.length).toBe(antes)
})

test('REGRESSAO colar desenha UMA vez, nao uma por caractere', () => {
  const t = fakeTerminal()
  void app(t).run()
  const antes = t.saida.length
  t.tecla('\x1b[200~um texto colado razoavelmente longo\x1b[201~')
  const quadros = t.saida.length - antes
  expect(quadros).toBeLessThanOrEqual(3)
  expect(t.tela()).toContain('um texto colado razoavelmente longo')
})

test('REGRESSAO rajada sem bracketed paste tambem desenha uma vez', () => {
  const t = fakeTerminal()
  void app(t).run()
  const antes = t.saida.length
  t.tecla('rajada de caracteres colados sem marcador')
  expect(t.saida.length - antes).toBeLessThanOrEqual(3)
})

test('digitacao normal continua redesenhando por tecla', () => {
  const t = fakeTerminal()
  void app(t).run()
  const antes = t.saida.length
  t.tecla('a')
  t.tecla('b')
  expect(t.saida.length).toBeGreaterThan(antes)
})

test('link no log vira clicavel sem quebrar o quadro', () => {
  const t = fakeTerminal(12, 60)
  const a = app(t)
  void a.run()
  a.log('preview → http://localhost:5220')
  expect(t.saida.join('')).toContain('\x1b]8;;http://localhost:5220')
  expect(t.tela()).toContain('localhost:5220')
})
