import { test, expect } from 'bun:test'
import { linhaPropriedades, linhasExecucao, emExecucao, quadroDoGiro, GIRO } from '../lib/core/render/rodape'
import type { Fields } from '../lib/card'

const props = {
  provedor: 'claude', modelo: 'opus', effort: 'medium',
  projeto: 'org/app', custoHoje: '2.37', divergentes: [],
}

function card(over: Partial<Fields>): Fields {
  return { id: '1', title: 'tarefa', status: 'READY', repo: 'org/app', ...over }
}

test('propriedades mostram ia, esforco, projeto e gasto', () => {
  const l = linhaPropriedades(props)
  expect(l).toContain('claude/opus')
  expect(l).toContain('esforco medium')
  expect(l).toContain('org/app')
  expect(l).toContain('US$2.37')
})

test('provedor sem modelo nao mostra barra solta', () => {
  expect(linhaPropriedades({ ...props, modelo: '' })).toContain('ia claude')
  expect(linhaPropriedades({ ...props, modelo: '' })).not.toContain('claude/')
})

test('papel com provedor diferente aparece destacado', () => {
  const l = linhaPropriedades({ ...props, divergentes: ['gate: deepseek'] })
  expect(l).toContain('gate: deepseek')
})

test('sem projeto e sem gasto, omite os campos em vez de mostrar vazio', () => {
  const l = linhaPropriedades({ ...props, projeto: '', custoHoje: '' })
  expect(l).not.toContain('projeto')
  expect(l).not.toContain('US$')
})

test('emExecucao pega so os ativos do projeto', () => {
  const r = emExecucao([
    card({ id: '1', status: 'EXECUTING' }),
    card({ id: '2', status: 'PREVIEW' }),
    card({ id: '3', status: 'EXECUTING', repo: 'org/outro' }),
  ], 'org/app', Date.now(), () => 'vitro')
  expect(r.length).toBe(1)
  expect(r[0]?.id).toBe('1')
  expect(r[0]?.agente).toBe('vitro')
})

test('linhas de execucao mostram id, titulo, estado e agente', () => {
  const l = linhasExecucao(emExecucao(
    [card({ id: '7', status: 'EXECUTING', title: 'selo no hero', updated: new Date().toISOString() })],
    'org/app', Date.now(), () => 'vitro',
  ), { width: 90 })
  expect(l[0]).toContain('#007')
  expect(l[0]).toContain('selo no hero')
  expect(l[0]).toContain('executing')
  expect(l[0]).toContain('vitro')
})

test('sem nada rodando, diz isso em vez de sumir', () => {
  expect(linhasExecucao([])[0]).toContain('nada em execucao')
})

test('limita a 3 linhas para nao comer a tela', () => {
  const muitos = Array.from({ length: 8 }, (_, i) => card({ id: String(i + 1), status: 'EXECUTING' }))
  expect(linhasExecucao(emExecucao(muitos, 'org/app', Date.now(), () => '')).length).toBe(3)
})

test('giro avanca com o tempo e volta ao inicio', () => {
  expect(quadroDoGiro(0)).toBe(GIRO[0])
  expect(quadroDoGiro(120)).toBe(GIRO[1])
  expect(quadroDoGiro(120 * GIRO.length)).toBe(GIRO[0])
})

test('sem cor nao emite escape ANSI', () => {
  expect(linhaPropriedades(props, { color: false })).not.toContain('\x1b[')
  expect(linhasExecucao(emExecucao([card({ status: 'EXECUTING' })], '', 0, () => ''), { color: false })[0]).not.toContain('\x1b[')
})
