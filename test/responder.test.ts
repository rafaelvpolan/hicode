import { test, expect, beforeEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolverResposta, cardsPerguntando } from '../lib/core/responder'
import { renderPergunta, quebrar } from '../lib/core/render/clarify'
import type { ClarifyQuestion, Fields } from '../lib/card/types'

const pergunta: ClarifyQuestion = {
  q: 'Qual selo remover?',
  options: ['Só o do header', 'Só o do hero', 'Ambos'],
  recommended: 'Só o do header',
}

test('numero escolhe a opcao pela ordem mostrada', () => {
  expect(resolverResposta(pergunta, '2')).toBe('Só o do hero')
  expect(resolverResposta(pergunta, ' 3 ')).toBe('Ambos')
})

test('enter vazio aceita o sugerido', () => {
  expect(resolverResposta(pergunta, '')).toBe('Só o do header')
  expect(resolverResposta(pergunta, 'r')).toBe('Só o do header')
})

test('texto livre vira a resposta', () => {
  expect(resolverResposta(pergunta, 'nenhum, deixe os dois')).toBe('nenhum, deixe os dois')
})

test('numero fora da lista nao vira resposta silenciosa', () => {
  expect(resolverResposta(pergunta, '9')).toBe('')
  expect(resolverResposta(pergunta, '0')).toBe('')
})

test('sem recomendado, enter cai na primeira opcao', () => {
  expect(resolverResposta({ ...pergunta, recommended: '' }, '')).toBe('Só o do header')
})

function card(over: Partial<Fields>): Fields {
  return { id: '1', title: 't', status: 'READY', repo: 'org/app', ...over }
}

test('so lista cards em CLARIFY, e so do repo atual', () => {
  const cards = [
    card({ id: '022', status: 'CLARIFY' }),
    card({ id: '023', status: 'EXECUTING' }),
    card({ id: '024', status: 'CLARIFY', repo: 'org/outro' }),
  ]
  expect(cardsPerguntando(cards, 'org/app')).toEqual(['022'])
  expect(cardsPerguntando(cards)).toEqual(['022', '024'])
})

test('render numera as opcoes e marca a sugerida', () => {
  const t = renderPergunta({ id: '022', titulo: 'x', perguntas: [pergunta], indice: 0, atual: pergunta }).join('\n')
  expect(t).toContain('1  Só o do header')
  expect(t).toContain('2  Só o do hero')
  expect(t).toContain('← sugerido')
  expect(t).not.toContain('1/1')
})

test('render mostra o passo quando ha mais de uma pergunta', () => {
  const t = renderPergunta({ id: '022', titulo: 'x', perguntas: [pergunta, pergunta], indice: 1, atual: pergunta }).join('\n')
  expect(t).toContain('(2/2)')
})

test('render sem cor nao emite escape ANSI', () => {
  const t = renderPergunta({ id: '022', titulo: 'x', perguntas: [pergunta], indice: 0, atual: pergunta }).join('\n')
  expect(t).not.toContain('\x1b[')
})

test('pergunta longa quebra em linhas dentro da largura', () => {
  const linhas = quebrar('a'.repeat(3) + ' palavra '.repeat(30), 40)
  expect(linhas.every(l => l.length <= 40)).toBe(true)
  expect(linhas.length).toBeGreaterThan(1)
})

import { renderRespondidas } from '../lib/core/render/clarify'

test('mostra as decisoes ja tomadas, pergunta e resposta', () => {
  const t = renderRespondidas('022', [
    { q: 'Qual selo remover?', answer: 'Só o do header' },
    { q: 'Sem resposta ainda', answer: '' },
  ]).join('\n')
  expect(t).toContain('Qual selo remover?')
  expect(t).toContain('→ Só o do header')
  expect(t).not.toContain('Sem resposta ainda')
})

test('card sem pergunta nem resposta diz isso', () => {
  expect(renderRespondidas('030', []).join('')).toContain('nao tem pergunta nem resposta')
})
