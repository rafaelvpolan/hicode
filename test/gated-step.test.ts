import { test, expect, afterAll, mock } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { GateResult } from '../lib/runner/codefox-gate'
import type { StepResult } from '../lib/runner/agent'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-gated-'))
process.env.HICODE_CARDS_DIR = CARDS
process.env.HICODE_REAJUSTE_RETRIES = '2'

interface Chamada {
  instrucao: string
}

const stepCalls: Chamada[] = []
let stepQueue: StepResult[] = []
let gateQueue: GateResult[] = []

function step(over: Partial<StepResult>): StepResult {
  return { time: 1, cost: 0.01, costMeasured: true, tokens: 100, text: 'fez', ok: true, ...over }
}

function gate(over: Partial<GateResult>): GateResult {
  return { ok: true, verdict: 'APPROVED', reason: '', questions: [], cost: 0.02, costMeasured: true, tokens: 200, ...over }
}

const realAgent = await import('../lib/runner/agent')
mock.module('../lib/runner/agent', () => ({
  ...realAgent,
  runStep: (_wt: string, _agent: string, instruction: string): Promise<StepResult> => {
    stepCalls.push({ instrucao: instruction })
    return Promise.resolve(stepQueue.shift() ?? step({}))
  },
}))

const realCodefoxGate = await import('../lib/runner/codefox-gate')
mock.module('../lib/runner/codefox-gate', () => ({
  ...realCodefoxGate,
  runGatedReview: (): Promise<GateResult> => Promise.resolve(gateQueue.shift() ?? gate({})),
}))

const { createCard } = await import('../lib/runner/card-store')
const { runGatedStep } = await import('../lib/runner/gated')

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

function reset(steps: StepResult[], gates: GateResult[]): string {
  stepCalls.length = 0
  stepQueue = steps
  gateQueue = gates
  return createCard({ title: 'gated', status: 'REFINED' }, '## Objetivo\nalgo\n')
}

function run(id: string): Promise<{ ok: boolean; reason: string; metric: { cost: number; tokens: number } }> {
  return runGatedStep(id, '/tmp/wt', 'main', 'rufus', 'melhore X', 'objetivo', 'Arquitetura')
}

test('agente ok + crivo aprova na primeira: passa sem retry', async () => {
  const id = reset([step({})], [gate({ verdict: 'APPROVED' })])
  const r = await run(id)
  expect(r.ok).toBe(true)
  expect(stepCalls.length).toBe(1)
})

test('CONDITIONAL nao reprova o step', async () => {
  const id = reset([step({})], [gate({ verdict: 'CONDITIONAL', reason: 'ressalva' })])
  expect((await run(id)).ok).toBe(true)
})

test('crivo BLOCKED reexecuta o agente com o motivo da reprovacao no prompt', async () => {
  const id = reset(
    [step({}), step({})],
    [gate({ verdict: 'BLOCKED', reason: 'acoplou demais' }), gate({ verdict: 'APPROVED' })],
  )
  const r = await run(id)
  expect(r.ok).toBe(true)
  expect(stepCalls.length).toBe(2)
  expect(stepCalls[0]?.instrucao).not.toContain('CRIVO reprovou')
  expect(stepCalls[1]?.instrucao).toContain('acoplou demais')
})

test('BLOCKED persistente esgota as tentativas e devolve o motivo', async () => {
  const bloqueado = gate({ verdict: 'BLOCKED', reason: 'segue quebrado' })
  const id = reset(
    [step({}), step({}), step({})],
    [bloqueado, bloqueado, bloqueado],
  )
  const r = await run(id)
  expect(r.ok).toBe(false)
  expect(r.reason).toContain('segue quebrado')
  expect(stepCalls.length).toBe(3)
})

test('agente que falha consome tentativa e nao chama o crivo', async () => {
  const id = reset(
    [step({ ok: false, text: 'timeout' }), step({})],
    [gate({ verdict: 'APPROVED' })],
  )
  const r = await run(id)
  expect(r.ok).toBe(true)
  expect(stepCalls.length).toBe(2)
})

test('REGRESSAO crivo indisponivel: repete o GATE, nao reexecuta o agente', async () => {
  const naoRodou = gate({ ok: false, verdict: 'CONDITIONAL', reason: 'gate NAO executou (timeout)' })
  const id = reset([step({}), step({}), step({})], [naoRodou, naoRodou, naoRodou])
  const r = await run(id)
  expect(r.ok).toBe(false)
  expect(r.reason).toContain('crivo indisponivel')
  expect(stepCalls.length).toBe(1)
})

test('REGRESSAO crivo falha e volta na repeticao: aproveita o trabalho ja feito', async () => {
  const naoRodou = gate({ ok: false, verdict: 'CONDITIONAL', reason: 'saida ilegivel' })
  const id = reset([step({})], [naoRodou, gate({ verdict: 'APPROVED' })])
  const r = await run(id)
  expect(r.ok).toBe(true)
  expect(stepCalls.length).toBe(1)
})

test('REGRESSAO crivo indisponivel nao vira reprovacao no prompt do agente', async () => {
  const naoRodou = gate({ ok: false, verdict: 'CONDITIONAL', reason: 'timeout' })
  const id = reset([step({}), step({})], [naoRodou, naoRodou])
  await run(id)
  expect(stepCalls.some(c => c.instrucao.includes('CRIVO reprovou'))).toBe(false)
})

test('custo do gate repetido entra na conta mesmo sem veredito', async () => {
  const naoRodou = gate({ ok: false, verdict: 'CONDITIONAL', reason: 'timeout', cost: 0.02, tokens: 200 })
  const id = reset([step({ cost: 0.01, tokens: 100 })], [naoRodou, naoRodou])
  const r = await run(id)
  expect(r.metric.cost).toBeCloseTo(0.05, 5)
  expect(r.metric.tokens).toBe(500)
})

test('custo e tokens somam agente + crivo de todas as tentativas', async () => {
  const id = reset(
    [step({ cost: 0.01, tokens: 100 }), step({ cost: 0.01, tokens: 100 })],
    [gate({ verdict: 'BLOCKED', reason: 'x', cost: 0.02, tokens: 200 }), gate({ verdict: 'APPROVED', cost: 0.02, tokens: 200 })],
  )
  const r = await run(id)
  expect(r.metric.cost).toBeCloseTo(0.06, 5)
  expect(r.metric.tokens).toBe(600)
})
