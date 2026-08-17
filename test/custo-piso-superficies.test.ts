import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Card, Fields } from '../lib/card'
import type { CardView, RunView } from '../panel/shared/types'
import { renderFleet } from '../lib/core/render/fleet'
import { renderBoard } from '../lib/core/render/board'
import { renderCabecalhoTarefa, renderParada } from '../lib/core/render/tarefa'
import { linhaPropriedades } from '../lib/core/render/rodape'
import { dailySpend } from '../lib/runner/cost-gap'
import {
  cardCostLabel, cardFloorReason, floorProviders, isCostFloor, runCostLabel, runFloorReason,
} from '../panel/shared/cost-floor'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-piso-superficie-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
mkdirSync(join(process.env.HICODE_CARDS_DIR, 'runs'), { recursive: true })

const { createCard } = await import('../lib/runner/card-store')
const { getState } = await import('../panel/server/utils/state')
const { getRuns } = await import('../panel/server/utils/runs')

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

function cardView(over: Partial<CardView> = {}): CardView {
  return {
    id: '001', slug: 'x', title: 'x', status: 'EXECUTING', risk: 'low', repo: 'org/app',
    updated: '', desc: '', cost_usd: '1.0900', cost_floor: '', cost_unverified: '',
    tokens_total: '', verify: '', revalidacao: '', preview_url: '', pr_url: '', shot: false,
    halt_reason: '', surface: '', eval_score: '', eval_notes: '', ...over,
  }
}

function runView(over: Partial<RunView> = {}): RunView {
  return { id: '001', ts: '', title: 'x', tokens_total: 0, cost_usd: 0.5, cost_measured: true, duration_s: 0, ...over }
}

function cardFm(over: Fields = {}): Fields {
  return { id: '001', status: 'EXECUTING', repo: 'org/app', cost_usd: '1.0900', ...over }
}

test('painel: card com cost_floor mostra o valor como piso e diz quais provedores nao reportaram', () => {
  const card = cardView({ cost_floor: 'codex', cost_unverified: 'codex' })
  expect(cardCostLabel(card)).toBe('≥ $1.0900')
  expect(isCostFloor(card)).toBe(true)
  expect(cardFloorReason(card)).toContain('codex')
  expect(cardFloorReason(card)).toContain('piso')
})

test('painel: card sem piso nao renderiza marcador nem motivo', () => {
  const card = cardView()
  expect(cardCostLabel(card)).toBe('$1.0900')
  expect(cardCostLabel(card)).not.toContain('≥')
  expect(isCostFloor(card)).toBe(false)
  expect(cardFloorReason(card)).toBe('')
})

test('painel: card antigo so com cost_unverified ainda conta como piso', () => {
  const card = cardView({ cost_unverified: 'codex' })
  expect(isCostFloor(card)).toBe(true)
  expect(cardCostLabel(card)).toBe('≥ $1.0900')
})

test('painel: provedores do piso saem sem repeticao e sem entrada vazia', () => {
  expect(floorProviders({ cost_floor: 'codex, claude', cost_unverified: 'codex' })).toEqual(['codex', 'claude'])
  expect(floorProviders({ cost_floor: '', cost_unverified: '' })).toEqual([])
})

test('painel: run nao medido mostra o custo como piso; run medido nao marca nada', () => {
  expect(runCostLabel(runView({ cost_measured: false }))).toBe('≥ $0.5000')
  expect(runFloorReason(runView({ cost_measured: false }))).toContain('piso')
  expect(runCostLabel(runView())).toBe('$0.5000')
  expect(runFloorReason(runView())).toBe('')
})

test('frota: um unico card marcado transforma o total da frota em piso e qualifica o teto', () => {
  const t = renderFleet(
    [cardFm({ id: '1' }), cardFm({ id: '2', status: 'PREVIEW', cost_floor: 'codex' })],
    { repo: 'org/app', daemon: 'online', costToday: '3.00', costCap: '5.00' },
  )
  expect(t).toContain('≥ US$3.00 / teto US$5.00')
  expect(t).toContain('piso: codex sem reporte de gasto')
  expect(t).toContain('folga do teto nao garantida')
})

test('frota: sem card marcado o total sai limpo, sem marcador e sem ruido', () => {
  const t = renderFleet(
    [cardFm({ id: '1' }), cardFm({ id: '2', status: 'PREVIEW' })],
    { repo: 'org/app', daemon: 'online', costToday: '3.00', costCap: '5.00' },
  )
  expect(t).toContain('· US$3.00 / teto US$5.00')
  expect(t).not.toContain('≥')
  expect(t).not.toContain('piso')
})

test('frota: card marcado ja entregue continua puxando o piso do total', () => {
  const t = renderFleet(
    [cardFm({ id: '1' }), cardFm({ id: '2', status: 'MERGED', cost_unverified: 'claude' })],
    { repo: 'org/app', daemon: 'online', costToday: '3.00' },
  )
  expect(t).toContain('≥ US$3.00')
  expect(t).toContain('piso: claude sem reporte de gasto')
  expect(t).not.toContain('folga do teto')
})

test('frota: o piso da frota junta os provedores de cards diferentes sem repetir', () => {
  const t = renderFleet(
    [cardFm({ id: '1', cost_floor: 'codex' }), cardFm({ id: '2', cost_floor: 'codex, claude' })],
    { repo: 'org/app', daemon: 'online', costToday: '3.00' },
  )
  expect(t).toContain('piso: codex, claude sem reporte de gasto')
})

test('frota sem custo informado nao ganha marcador mesmo com card marcado', () => {
  const t = renderFleet([cardFm({ id: '1', cost_floor: 'codex' })], { repo: 'org/app', daemon: 'online' })
  expect(t).not.toContain('piso')
  expect(t).not.toContain('US$')
})

function props(over: Partial<Parameters<typeof linhaPropriedades>[0]> = {}): Parameters<typeof linhaPropriedades>[0] {
  return {
    provedor: 'claude', modelo: 'opus', effort: 'medium', projeto: 'org/app',
    custoHoje: '3.00', pisoDoGasto: '', divergentes: [], ...over,
  }
}

test('board: um card com piso transforma o acumulado do projeto em piso e nomeia o provedor', () => {
  const t = renderBoard(
    [cardFm({ id: '20', cost_usd: '0.7726', cost_floor: 'codex' }), cardFm({ id: '21', cost_usd: '1.0000' })],
    { repo: 'org/app' },
  )
  expect(t).toContain('2 card(s) · ≥ US$1.77 acumulado')
  expect(t).toContain('piso: codex sem reporte de gasto')
})

test('board: sem card marcado o acumulado sai afirmativo, sem marcador e sem ruido', () => {
  const t = renderBoard(
    [cardFm({ id: '20', cost_usd: '0.7726' }), cardFm({ id: '21', cost_usd: '1.0000' })],
    { repo: 'org/app' },
  )
  expect(t).toContain('2 card(s) · US$1.77 acumulado')
  expect(t).not.toContain('≥')
  expect(t).not.toContain('piso')
})

test('board: piso de card de outro projeto nao contamina o acumulado exibido', () => {
  const t = renderBoard(
    [cardFm({ id: '1', cost_usd: '1.00' }), cardFm({ id: '2', repo: 'org/outro', cost_usd: '9.00', cost_floor: 'codex' })],
    { repo: 'org/app' },
  )
  expect(t).toContain('1 card(s) · US$1.00 acumulado')
  expect(t).not.toContain('piso')
})

test('board: card so com cost_unverified tambem puxa o acumulado para piso', () => {
  const t = renderBoard([cardFm({ id: '1', cost_usd: '2.00', cost_unverified: 'claude' })], { repo: 'org/app' })
  expect(t).toContain('≥ US$2.00 acumulado')
  expect(t).toContain('piso: claude sem reporte de gasto')
})

test('board: a linha do card marcado mostra o proprio custo como piso, e a do medido nao', () => {
  const t = renderBoard(
    [cardFm({ id: '20', cost_usd: '0.7726', cost_floor: 'codex' }), cardFm({ id: '21', cost_usd: '1.0000' })],
    { repo: 'org/app' },
  )
  expect(t).toContain('≥$0.7726')
  expect(t).toContain(' $1.0000')
  expect(t).not.toContain('≥$1.0000')
})

function cardAberto(over: Fields = {}): Card {
  return { fm: cardFm({ id: '020', title: 't', cost_usd: '0.7726', ...over }), order: [], body: '', file: '020-x.md' }
}

test('tarefa aberta: card com piso mostra o gasto como piso e nomeia o provedor', () => {
  const l = renderCabecalhoTarefa(cardAberto({ cost_floor: 'codex' }), { width: 78 })
  expect(l).toContain('  gasto    ≥ US$0.77')
  expect(l).toContain('           piso: codex sem reporte de gasto')
})

test('tarefa aberta: card medido sai byte a byte como antes de o marcador existir', () => {
  const l = renderCabecalhoTarefa(cardAberto(), { width: 78 })
  expect(l).toContain('  gasto    US$0.77')
  expect(l.join('\n')).not.toContain('≥')
  expect(l.join('\n')).not.toContain('piso')
})

test('tarefa aberta: card so com cost_unverified tambem sai como piso', () => {
  const l = renderCabecalhoTarefa(cardAberto({ cost_unverified: 'claude' }), { width: 78 }).join('\n')
  expect(l).toContain('≥ US$0.77')
  expect(l).toContain('piso: claude sem reporte de gasto')
})

test('tarefa aberta e board nao podem discordar sobre o mesmo card', () => {
  const fm = cardFm({ id: '020', cost_usd: '0.7726', cost_floor: 'codex' })
  expect(renderBoard([fm], { repo: 'org/app' })).toContain('≥$0.7726')
  expect(renderCabecalhoTarefa({ fm, order: [], body: '', file: '020-x.md' }, { width: 78 }).join('\n')).toContain('≥ US$0.77')
})

test('tela de parada: gasto com piso vem marcado e com o motivo', () => {
  const t = renderParada('020', { custo: '0.77', pisoDoGasto: 'codex' }).join('\n')
  expect(t).toContain('≥ US$0.77 ate aqui')
  expect(t).toContain('piso: codex sem reporte de gasto')
})

test('tela de parada: gasto medido continua afirmativo, sem marcador', () => {
  const t = renderParada('020', { custo: '0.77' }).join('\n')
  expect(t).toContain('US$0.77 ate aqui')
  expect(t).not.toContain('≥')
  expect(t).not.toContain('piso')
})

test('tela de parada: piso sem valor nao inventa numero, mas nao silencia o piso', () => {
  const t = renderParada('020', { pisoDoGasto: 'codex' }).join('\n')
  expect(t).not.toContain('US$')
  expect(t).toContain('piso: codex sem reporte de gasto')
})

test('rodape: o gasto do dia sai como piso e diz qual provedor nao reportou', () => {
  const l = linhaPropriedades(props({ pisoDoGasto: 'codex' }))
  expect(l).toContain('gasto ≥ US$3.00')
  expect(l).toContain('piso: codex sem reporte de gasto')
})

test('rodape: gasto medido continua afirmativo, sem marcador', () => {
  const l = linhaPropriedades(props())
  expect(l).toContain('gasto US$3.00')
  expect(l).not.toContain('≥')
  expect(l).not.toContain('piso')
})

test('rodape: sem gasto no dia nao aparece marcador de piso solto', () => {
  const l = linhaPropriedades(props({ custoHoje: '', pisoDoGasto: 'codex' }))
  expect(l).not.toContain('US$')
  expect(l).not.toContain('piso')
})

test('rodape: piso e divergencia de papel convivem sem se apagar', () => {
  const l = linhaPropriedades(props({ pisoDoGasto: 'codex', divergentes: ['gate: deepseek'] }))
  expect(l).toContain('piso: codex sem reporte de gasto')
  expect(l).toContain('gate: deepseek')
})

test('gasto do dia: o piso vem so dos cards do dia que produziram o numero', () => {
  const hoje = { updated: '2026-08-15T10:00:00Z' }
  const ontem = { updated: '2026-08-14T10:00:00Z' }
  const cards = [
    cardFm({ id: '1', cost_usd: '1.00', ...hoje }),
    cardFm({ id: '2', cost_usd: '5.00', cost_floor: 'codex', ...ontem }),
  ]
  expect(dailySpend(cards, '2026-08-15')).toEqual({ total: '1.00', floor: '' })
})

test('gasto do dia: card do dia sem reporte marca o total como piso', () => {
  const cards = [
    cardFm({ id: '1', cost_usd: '1.00', updated: '2026-08-15T10:00:00Z' }),
    cardFm({ id: '2', cost_usd: '2.00', cost_unverified: 'codex', updated: '2026-08-15T11:00:00Z' }),
  ]
  expect(dailySpend(cards, '2026-08-15')).toEqual({ total: '3.00', floor: 'codex' })
})

test('REGRESSAO: dia cujo unico card e todo de provedor que nao reporta sai como piso, nao mudo', () => {
  const cards = [cardFm({ id: '1', cost_usd: '0', cost_floor: 'codex', updated: '2026-08-15T10:00:00Z' })]
  expect(dailySpend(cards, '2026-08-15')).toEqual({ total: '0.00', floor: 'codex' })
})

test('gasto do dia: dia sem gasto e sem piso continua mudo', () => {
  const cards = [cardFm({ id: '1', cost_usd: '0', updated: '2026-08-15T10:00:00Z' })]
  expect(dailySpend(cards, '2026-08-15')).toEqual({ total: '', floor: '' })
})

test('painel: o estado servido carrega cost_floor e cost_unverified do card', () => {
  const id = createCard(
    { title: 'tarefa com piso', status: 'EXECUTING', repo: 'org/app', cost_usd: '1.0900', cost_floor: 'codex', cost_unverified: 'codex' },
    '## Objetivo\nfazer algo\n',
  )
  const limpo = createCard(
    { title: 'tarefa medida', status: 'EXECUTING', repo: 'org/app', cost_usd: '2.0000' },
    '## Objetivo\nfazer outra coisa\n',
  )
  const cards = getState().cards
  const comPiso = cards.find((c) => c.id === id)
  const semPiso = cards.find((c) => c.id === limpo)
  expect(comPiso?.cost_floor).toBe('codex')
  expect(comPiso && cardCostLabel(comPiso)).toBe('≥ $1.0900')
  expect(semPiso?.cost_floor).toBe('')
  expect(semPiso && cardCostLabel(semPiso)).toBe('$2.0000')
})

test('painel: o run servido carrega cost_measured, e run antigo sem o campo nao vira alarme falso', () => {
  const dir = join(process.env.HICODE_CARDS_DIR ?? '', 'runs')
  writeFileSync(join(dir, '001-20260101000000.json'), JSON.stringify({ id: '001', ts: '2026-01-01T00:00:00Z', cost_usd: 0.5, cost_measured: false }))
  writeFileSync(join(dir, '002-20260101000001.json'), JSON.stringify({ id: '002', ts: '2026-01-01T00:00:01Z', cost_usd: 0.5, cost_measured: true }))
  writeFileSync(join(dir, '003-20260101000002.json'), JSON.stringify({ id: '003', ts: '2026-01-01T00:00:02Z', cost_usd: 0.5 }))
  const runs = getRuns()
  const por = (id: string): RunView | undefined => runs.find((r) => r.id === id)
  expect(por('001')?.cost_measured).toBe(false)
  expect(runCostLabel(por('001') ?? runView())).toBe('≥ $0.5000')
  expect(por('002')?.cost_measured).toBe(true)
  expect(por('003')?.cost_measured).toBe(true)
  expect(runCostLabel(por('003') ?? runView())).toBe('$0.5000')
})

test('REGRESSAO: custo zero com piso nao apaga o marcador — o caso canonico do codex', () => {
  const fm = cardFm({ id: '030', cost_usd: '0.0000', cost_floor: 'codex', cost_unverified: 'codex', tokens_total: '48000' })

  const cabecalho = renderCabecalhoTarefa({ fm, body: '' } as Card, {}).join('\n')
  expect(cabecalho).toContain('≥ US$0.00')
  expect(cabecalho).toContain('piso: codex')

  const parada = renderParada('030', { custo: '0.00', pisoDoGasto: 'codex' }).join('\n')
  expect(parada).toContain('≥ US$0.00')
  expect(parada).toContain('piso: codex')

  const dia = dailySpend([{ ...fm, updated: '2026-08-17T10:00:00Z' }], '2026-08-17')
  expect(dia.total).toBe('0.00')
  expect(dia.floor).toBe('codex')
})

test('REGRESSAO: custo zero SEM piso continua mudo — sem alarme falso', () => {
  const fm = cardFm({ id: '031', cost_usd: '0.0000', cost_floor: '', cost_unverified: '', tokens_total: '0' })

  const cabecalho = renderCabecalhoTarefa({ fm, body: '' } as Card, {}).join('\n')
  expect(cabecalho).not.toContain('US$')
  expect(cabecalho).not.toContain('piso:')

  expect(renderParada('031', { custo: '', pisoDoGasto: '' }).join('\n')).not.toContain('US$')

  const dia = dailySpend([{ ...fm, updated: '2026-08-17T10:00:00Z' }], '2026-08-17')
  expect(dia.total).toBe('')
  expect(dia.floor).toBe('')
})
