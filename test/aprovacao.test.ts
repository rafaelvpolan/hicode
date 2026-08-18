import { test, expect } from 'bun:test'
import { renderAprovacao, OPCOES_APROVACAO } from '../lib/core/render/aprovacao'
import { renderPendencia, pendenciaDoStatus } from '../lib/core/render/pendencia'
import { visibleLen, stripAnsi } from '../lib/core/tui/layout'

test('a ask de aprovacao oferece aprovar, refazer e comentar', () => {
  const t = renderAprovacao('022', { width: 78 }).join('\n')
  expect(t).toContain('#022 aprovar o resultado?')
  expect(t).toContain('1  aprovar')
  expect(t).toContain('2  recusar e refazer')
  expect(t).toContain('3  recusar dizendo o que ajustar')
})

test('mostra o link do preview quando o card tem um (aberto por voce ou pelo painel)', () => {
  expect(renderAprovacao('022', { url: 'http://localhost:5222' }).join('\n')).toContain('http://localhost:5222')
  expect(renderAprovacao('022').join('\n')).not.toContain('http')
})

test('a opcao escolhida pela seta fica marcada', () => {
  const linhas = renderAprovacao('022', { selecionado: 'op:2' })
  expect(linhas[1]?.startsWith('›')).toBe(false)
  expect(linhas[2]?.startsWith('›')).toBe(true)
})

test('no modo comentario, pede o texto e diz como desistir', () => {
  const t = renderAprovacao('022', { comentando: true }).join('\n')
  expect(t).toContain('escreva o que ajustar')
  expect(t).toContain('enter vazio desiste')
  expect(t).not.toContain('aprovar')
})

test('aprovar e recusar tem cores diferentes', () => {
  const t = renderAprovacao('022', { color: true }).join('\n')
  expect(t).toContain('\x1b[32m')
  expect(t).toContain('\x1b[31m')
})

test('cabe em qualquer largura', () => {
  for (const width of [30, 50, 78]) {
    for (const l of renderAprovacao('022', { width, url: 'http://localhost:5222/muito/longo' })) {
      expect(visibleLen(l)).toBeLessThanOrEqual(width)
    }
  }
})

test('sem cor nao emite escape ANSI', () => {
  expect(renderAprovacao('022', { color: false }).join('')).not.toContain('\x1b[')
})

test('as tres opcoes tem chave 1, 2 e 3', () => {
  expect(OPCOES_APROVACAO.map(o => o.chave)).toEqual(['1', '2', '3'])
})

test('cada estado que espera humano diz o que fazer', () => {
  for (const status of ['CLARIFY', 'PREVIEW', 'READY', 'HALTED', 'PR_OPEN']) {
    const p = pendenciaDoStatus(status, '022')
    expect(p, status).not.toBe(null)
    expect(p?.acoes.length).toBeGreaterThan(0)
  }
})

test('estado que nao espera ninguem nao pede nada', () => {
  expect(pendenciaDoStatus('EXECUTING', '022')).toBe(null)
  expect(stripAnsi(renderPendencia('EXECUTING', '022').join('\n'))).toContain('nada a fazer agora')
})

test('bloco de pendencia mostra a tecla e o que ela faz', () => {
  const t = stripAnsi(renderPendencia('PREVIEW', '022', { width: 78 }).join('\n'))
  expect(t).toContain('precisa de voce')
  expect(t).toContain('resultado pronto')
  expect(t).toContain('enter')
  expect(t).toContain('1 2 3')
})

test('REGRESSAO a pendencia nunca ensina comando que o parser recusa', async () => {
  const { handle, newSession } = await import('../lib/core/session')
  const estados = ['CLARIFY', 'PREVIEW', 'INBOX', 'READY', 'SPECCED', 'PLAN_APPROVED', 'HALTED', 'PAUSED', 'PR_OPEN']
  const teclas = estados.flatMap(s => pendenciaDoStatus(s, '022')?.acoes.map(a => a.tecla) ?? [])
  expect(teclas.length).toBeGreaterThan(estados.length)
  for (const tecla of teclas.filter(x => x.startsWith('/'))) {
    expect(handle(tecla, newSession('org/app')).effect.kind, tecla).not.toBe('error')
  }
  const numeros = teclas.filter(x => /^\d+$/.test(x))
  expect(numeros.length, 'sem tecla digitavel o laco acima nao prova nada').toBeGreaterThan(0)
  for (const n of numeros) expect(handle(n, newSession('org/app')).effect.kind, n).toBe('plan')
})

test('REGRESSAO 1 2 3 dentro da tarefa em PREVIEW cai na aprovacao, nao no plano do card #001', async () => {
  const { handle, newSession, seguir, sincronizarAprovacao } = await import('../lib/core/session')
  expect(pendenciaDoStatus('PREVIEW', '022')?.acoes.map(a => a.tecla)).toContain('1 2 3')
  const dentro = sincronizarAprovacao(seguir(newSession('org/app'), '022'), 'PREVIEW')
  for (const tecla of ['1', '2', '3']) {
    const r = handle(tecla, dentro)
    expect(r.effect.kind, tecla).toBe('aprovacao')
    expect(r.effect.id, tecla).toBe('022')
    expect(r.effect.text, tecla).toBe(tecla)
  }
  expect(handle('', dentro).effect.kind).toBe('acao-tarefa')
})

test('tarefa parada ensina a retomar ou instruir', () => {
  const t = stripAnsi(renderPendencia('HALTED', '022').join('\n'))
  expect(t).toContain('parou')
  expect(t).toContain('retoma de onde parou')
  expect(t).toContain('instrucao nova')
})

test('PR aberto aponta para o GitHub, com o link quando ha', () => {
  const t = stripAnsi(renderPendencia('PR_OPEN', '022', { detalhe: 'https://github.com/x/y/pull/9' }).join('\n'))
  expect(t).toContain('revisao e sua')
  expect(t).toContain('pull/9')
})

test('bloco de pendencia cabe na largura', () => {
  for (const width of [30, 50, 78]) {
    for (const l of renderPendencia('PREVIEW', '022', { width })) {
      expect(visibleLen(l)).toBeLessThanOrEqual(width)
    }
  }
})
