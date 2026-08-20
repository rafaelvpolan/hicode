import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { CardView, RunView } from '../panel/shared/types'
import {
  cardCostLabel, cardFloorReason, floorProviders, isCostFloor, runCostLabel, runFloorReason,
} from '../panel/shared/cost-floor'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-piso-superficie-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
mkdirSync(join(process.env.HICODE_CARDS_DIR, 'runs'), { recursive: true })

const { createCard } = await import('../panel/server/card')
const { getState } = await import('../panel/server/utils/state')
const { getRuns, getStepEstimates } = await import('../panel/server/utils/runs')

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

test('painel: getRuns nao devolve linha-fantasma para sidecar (attempts/clarify) nem para conversa', () => {
  const dir = join(process.env.HICODE_CARDS_DIR ?? '', 'runs')
  writeFileSync(join(dir, '005.attempts.json'), JSON.stringify([{ tentativa: 1 }]))
  writeFileSync(join(dir, '005.clarify.json'), JSON.stringify({ perguntas: [] }))
  writeFileSync(join(dir, 'conversa-20260819120000-1.json'), JSON.stringify({
    ts: '2026-08-19T12:00:00Z', ok: true, cost_usd: '0.02', kind: 'conversa',
  }))
  const runs = getRuns()
  expect(runs.find((r) => r.title === '#')).toBeUndefined()
  expect(runs.find((r) => r.id === '')).toBeUndefined()
})

test('painel: getStepEstimates faz a media do tempo MEDIDO por passo entre runs — e a estimativa exibida para quem ainda nao rodou', () => {
  const dir = join(process.env.HICODE_CARDS_DIR ?? '', 'runs')
  writeFileSync(join(dir, '900-20260101000000.json'), JSON.stringify({
    id: '900', ts: '2026-01-01T00:00:00Z', cost_usd: '0.1',
    steps: { Testes: { time: 10, cost: 0.1, tokens: 5 }, Arquitetura: { time: 0, cost: 0, tokens: 0 } },
  }))
  writeFileSync(join(dir, '901-20260101000001.json'), JSON.stringify({
    id: '901', ts: '2026-01-01T00:00:01Z', cost_usd: '0.2',
    steps: { Testes: { time: 20, cost: 0.2, tokens: 8 } },
  }))
  const estimativas = getStepEstimates()
  expect(estimativas.Testes).toBe(15)
})

test('painel: getStepEstimates ignora passo com tempo zero/ausente ao calcular a media — nao derruba o real com placeholder', () => {
  const dir = join(process.env.HICODE_CARDS_DIR ?? '', 'runs')
  writeFileSync(join(dir, '902-20260101000002.json'), JSON.stringify({
    id: '902', ts: '2026-01-01T00:00:02Z', cost_usd: '0',
    steps: { SoZerado: { time: 0, cost: 0, tokens: 0 } },
  }))
  const estimativas = getStepEstimates()
  expect(estimativas.SoZerado).toBeUndefined()
})

test('painel: getStepEstimates nao quebra com run que nao tem steps (formato antigo/sidecar)', () => {
  const dir = join(process.env.HICODE_CARDS_DIR ?? '', 'runs')
  writeFileSync(join(dir, '903-20260101000003.json'), JSON.stringify({
    id: '903', ts: '2026-01-01T00:00:03Z', cost_usd: '0',
  }))
  expect(() => getStepEstimates()).not.toThrow()
})
