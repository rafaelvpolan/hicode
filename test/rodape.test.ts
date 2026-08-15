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

test('REGRESSAO: card WAITING aparece no rodape como em execucao — o motor ainda cuida dele, so que em espera de retomada', () => {
  const r = emExecucao([card({ id: '9', status: 'WAITING' })], 'org/app', Date.now(), () => 'vitro')
  expect(r.length).toBe(1)
  expect(r[0]?.id).toBe('9')
})

test('limita a 3 linhas, mas diz quantas ficaram de fora', () => {
  const muitos = Array.from({ length: 8 }, (_, i) => card({ id: String(i + 1), status: 'EXECUTING' }))
  const linhas = linhasExecucao(emExecucao(muitos, 'org/app', Date.now(), () => ''))
  expect(linhas.length).toBe(4)
  expect(linhas[3]).toContain('e mais 5')
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

import { esperandoVoce, linhasEspera } from '../lib/core/render/rodape'

function c(over: Partial<Fields>): Fields {
  return { id: '1', title: 't', status: 'READY', repo: 'org/app', ...over }
}

test('lista quem espera voce, com o comando que destrava', () => {
  const e = esperandoVoce([
    c({ id: '22', status: 'CLARIFY' }),
    c({ id: '23', status: 'PREVIEW' }),
    c({ id: '24', status: 'READY' }),
    c({ id: '25', status: 'EXECUTING' }),
  ], 'org/app')
  expect(e.map(x => x.comando)).toEqual(['/ask 22', '/ok 23', '/plan 24'])
})

test('card rodando nao aparece como esperando voce', () => {
  expect(esperandoVoce([c({ status: 'EXECUTING' }), c({ status: 'REVIEWED' })], 'org/app')).toEqual([])
})

test('espera de outro projeto nao polui a faixa', () => {
  expect(esperandoVoce([c({ status: 'CLARIFY', repo: 'org/outro' })], 'org/app')).toEqual([])
})

test('PR aberto conta como esperando revisao humana', () => {
  expect(esperandoVoce([c({ id: '9', status: 'PR_OPEN' })], 'org/app')[0]?.motivo).toContain('PR aberto')
})

test('mostra no maximo 3 e resume o resto', () => {
  const muitos = ['1', '2', '3', '4', '5'].map(id => c({ id, status: 'READY' }))
  const linhas = linhasEspera(esperandoVoce(muitos, 'org/app'))
  expect(linhas.length).toBe(4)
  expect(linhas[3]).toContain('e mais 2')
})

test('sem ninguem esperando, a faixa some', () => {
  expect(linhasEspera([])).toEqual([])
})

test('faixa sem cor nao emite escape ANSI', () => {
  const linhas = linhasEspera(esperandoVoce([c({ status: 'CLARIFY' })], 'org/app'), { color: false })
  expect(linhas.join('')).not.toContain('\x1b[')
})

test('linha selecionada do rodape ganha barra na margem', () => {
  const lista = esperandoVoce([c({ id: '22', status: 'CLARIFY' }), c({ id: '23', status: 'PREVIEW' })], 'org/app')
  const linhas = linhasEspera(lista, { selecionado: '23' })
  expect(linhas[0]?.startsWith('▌')).toBe(false)
  expect(linhas[1]?.startsWith('▌')).toBe(true)
})

test('a linha selecionada diz que e a que esta aberta', () => {
  const lista = esperandoVoce([c({ id: '22', status: 'CLARIFY' })], 'org/app')
  expect(linhasEspera(lista, { selecionado: '22' })[0]).toContain('← aberta')
  expect(linhasEspera(lista, { selecionado: '' })[0]).not.toContain('aberta')
})

test('com cor, so a selecionada fica em negrito', () => {
  const lista = esperandoVoce([c({ id: '22', status: 'CLARIFY', title: 'alvo' }), c({ id: '23', status: 'PREVIEW', title: 'outra' })], 'org/app')
  const linhas = linhasEspera(lista, { selecionado: '22', color: true })
  expect(linhas[0]).toContain('\x1b[1malvo')
  expect(linhas[1]).not.toContain('\x1b[1m')
})

test('sem selecao, nenhuma linha do rodape leva marca', () => {
  const lista = esperandoVoce([c({ id: '22', status: 'CLARIFY' })], 'org/app')
  expect(linhasEspera(lista)[0]?.startsWith('▌')).toBe(false)
})

test('a marca ocupa a mesma coluna, marcada ou nao', () => {
  const lista = esperandoVoce([c({ id: '22', status: 'CLARIFY' })], 'org/app')
  const sem = linhasEspera(lista)[0] ?? ''
  const com = linhasEspera(lista, { selecionado: '22' })[0] ?? ''
  expect(com.indexOf('#022')).toBe(sem.indexOf('#022'))
})

test('execucao selecionada tambem ganha barra e o aviso de aberta', () => {
  const lista = emExecucao([c({ id: '31', status: 'EXECUTING' })], 'org/app', 0, () => 'vitro')
  const linha = linhasExecucao(lista, { selecionado: '31' })[0] ?? ''
  expect(linha.startsWith('▌')).toBe(true)
  expect(linha).toContain('← aberta')
})

import { janelaDaLista } from '../lib/core/render/rodape'

const lista = (n: number): { id: string }[] => Array.from({ length: n }, (_, i) => ({ id: String(i + 1) }))

test('janela mostra o inicio quando nada esta selecionado', () => {
  expect(janelaDaLista(lista(10), '', 3).map(x => x.id)).toEqual(['1', '2', '3'])
})

test('janela acompanha a selecao alem do terceiro item', () => {
  expect(janelaDaLista(lista(10), '7', 3).map(x => x.id)).toEqual(['6', '7', '8'])
})

test('janela nao passa do fim da lista', () => {
  expect(janelaDaLista(lista(10), '10', 3).map(x => x.id)).toEqual(['8', '9', '10'])
})

test('lista curta aparece inteira', () => {
  expect(janelaDaLista(lista(2), '2', 3).map(x => x.id)).toEqual(['1', '2'])
})

test('execucao alem do limite mostra quantas ficaram de fora', () => {
  const rodando = Array.from({ length: 7 }, (_, i) =>
    c({ id: String(i + 1), status: 'EXECUTING' }))
  const linhas = linhasExecucao(emExecucao(rodando, 'org/app', 0, () => ''), { maxLinhas: 3 })
  expect(linhas.length).toBe(4)
  expect(linhas[3]).toContain('e mais 4')
})

test('navegar ate o fim mostra as ultimas em execucao', () => {
  const rodando = Array.from({ length: 7 }, (_, i) =>
    c({ id: String(i + 1), status: 'EXECUTING', title: `tarefa ${i + 1}` }))
  const linhas = linhasExecucao(emExecucao(rodando, 'org/app', 0, () => ''), { maxLinhas: 3, selecionado: '7' })
  expect(linhas.join(' ')).toContain('#007')
  expect(linhas.join(' ')).not.toContain('#001')
})

import { esperaHumano } from '../lib/core/render/phases'

test('uma definicao so de "esperando voce" — rodape e abas concordam', async () => {
  const { abasDe } = await import('../lib/core/render/board')
  const cards = [
    c({ id: '1', repo: 'org/site', status: 'CLARIFY' }),
    c({ id: '2', repo: 'org/site', status: 'READY' }),
    c({ id: '3', repo: 'org/site', status: 'PR_OPEN' }),
    c({ id: '4', repo: 'org/site', status: 'EXECUTING' }),
  ]
  expect(abasDe(['org/site'], cards)[0]?.esperando).toBe(esperandoVoce(cards, 'org/site').length)
})

test('estado que espera humano tem motivo e comando', () => {
  expect(esperaHumano('CLARIFY')?.comando).toBe('/ask')
  expect(esperaHumano('EXECUTING')).toBe(null)
})
