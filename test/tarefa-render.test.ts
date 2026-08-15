import { test, expect } from 'bun:test'
import { renderCabecalhoTarefa } from '../lib/core/render/tarefa'
import { visibleLen, stripAnsi } from '../lib/core/tui/layout'
import type { Card } from '../lib/card'

function card(fm: Record<string, string> = {}, body = '## Objetivo\nremova o selo\n'): Card {
  return {
    fm: { id: '022', status: 'EXECUTING', title: 'remova o header de beta', repo: 'org/app', ...fm },
    order: [], body, file: '022-x.md',
  }
}

test('cabecalho mostra id, estado e titulo', () => {
  const t = renderCabecalhoTarefa(card(), { width: 78 }).join('\n')
  expect(t).toContain('#022')
  expect(t).toContain('executing')
  expect(t).toContain('remova o header de beta')
})

test('mostra o prompt original e os sub-prompts numerados', () => {
  const t = renderCabecalhoTarefa(card(), {
    width: 78, objetivo: 'remova o selo', subs: ['tira o do hero', 'titulo em uma linha'],
  }).join('\n')
  expect(t).toContain('prompt')
  expect(t).toContain('remova o selo')
  expect(t).toContain('1. tira o do hero')
  expect(t).toContain('2. titulo em uma linha')
})

test('sem sub-prompt, nao inventa secao vazia', () => {
  const t = renderCabecalhoTarefa(card(), { width: 78, objetivo: 'x' }).join('\n')
  expect(t).not.toContain('depois')
})

test('convida a escrever mais instrucoes', () => {
  const t = renderCabecalhoTarefa(card(), { width: 78 }).join('\n')
  expect(t).toContain('escreva para mandar mais instrucoes')
  expect(t).toContain('/board volta')
})

test('preview vivo aparece com link; parado nao mente', () => {
  const vivo = renderCabecalhoTarefa(card({ worktree: '/wt' }), {
    width: 78, temDevServer: true, previewUrl: 'http://localhost:5222', vivo: true,
  }).join('\n')
  expect(vivo).toContain('http://localhost:5222')
  expect(vivo).toContain('no ar agora')

  const futuro = renderCabecalhoTarefa(card({ status: 'CLARIFY' }), {
    width: 78, temDevServer: true, previewUrl: 'http://localhost:5222',
  }).join('\n')
  expect(futuro).not.toContain('localhost:5222')
  expect(futuro).toContain('sobe quando a tarefa executar')
})

test('projeto sem dev server nao ganha linha de preview', () => {
  const t = renderCabecalhoTarefa(card(), { width: 78, temDevServer: false }).join('\n')
  expect(t).not.toContain('preview')
})

test('mostra o gasto quando existe, e omite quando nao', () => {
  const com = renderCabecalhoTarefa(card({ cost_usd: '0.2717', tokens_total: '35358' }), { width: 78 }).join('\n')
  expect(com).toContain('US$0.27')
  expect(com).toContain('35k tokens')
  expect(renderCabecalhoTarefa(card(), { width: 78 }).join('\n')).not.toContain('gasto')
})

test('cabe em qualquer largura', () => {
  const c = card({ title: 't'.repeat(120), cost_usd: '9.99' })
  for (const width of [40, 60, 78, 120]) {
    for (const l of renderCabecalhoTarefa(c, { width, objetivo: 'o'.repeat(200), subs: ['s'.repeat(200)] })) {
      expect(visibleLen(l)).toBeLessThanOrEqual(width)
    }
  }
})

test('com cor, o conteudo visivel e o mesmo', () => {
  const c = card({ cost_usd: '1.00' })
  const sem = renderCabecalhoTarefa(c, { width: 78, color: false, objetivo: 'x' })
  const com = renderCabecalhoTarefa(c, { width: 78, color: true, objetivo: 'x' }).map(stripAnsi)
  expect(com).toEqual(sem)
})

import { renderParada } from '../lib/core/render/tarefa'

test('painel de parada oferece retomar, apagar e sair', () => {
  const t = renderParada('022', { width: 78 }).join('\n')
  expect(t).toContain('#022 parado')
  expect(t).toContain('enter')
  expect(t).toContain('retoma de onde parou')
  expect(t).toContain('/rm 22')
  expect(t).toContain('ctrl+c')
})

test('painel de parada mostra quanto ja custou', () => {
  expect(renderParada('022', { gasto: 'US$1.44' }).join('\n')).toContain('US$1.44 ate aqui')
})

test('sem gasto, nao inventa numero', () => {
  expect(renderParada('022').join('\n')).not.toContain('US$')
})

test('painel de parada cabe na largura', () => {
  for (const width of [40, 60, 78]) {
    for (const l of renderParada('022', { width, gasto: 'US$1.44' })) {
      expect(visibleLen(l)).toBeLessThanOrEqual(width)
    }
  }
})

test('muitas instrucoes nao inundam o cabecalho', () => {
  const subs = Array.from({ length: 11 }, (_, i) => `instrucao ${i + 1}`)
  const t = renderCabecalhoTarefa(card(), { width: 78, subs }).join('\n')
  expect(t).toContain('(8 instrucao(oes) anterior(es))')
  expect(t).toContain('9. instrucao 9')
  expect(t).toContain('11. instrucao 11')
  expect(t).not.toContain('1. instrucao 1\n')
})

test('ate tres instrucoes aparecem inteiras', () => {
  const t = renderCabecalhoTarefa(card(), { width: 78, subs: ['a', 'b', 'c'] }).join('\n')
  expect(t).toContain('1. a')
  expect(t).toContain('3. c')
  expect(t).not.toContain('anterior(es)')
})
