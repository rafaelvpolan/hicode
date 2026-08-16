import { test, expect } from 'bun:test'
import { extractVerdictJson, gateOutcome, timeoutForDiff, withGateRetry } from '../lib/runner/codefox-gate'
import type { GateResult } from '../lib/runner/codefox-gate'

function gate(over: Partial<GateResult>): GateResult {
  return { ok: true, verdict: 'APPROVED', reason: '', questions: [], cost: 0, costMeasured: true, tokens: 0, ...over }
}

test('extrai o ultimo JSON de veredito valido em meio a prosa', () => {
  const t = 'analise... {"foo":1} veredito: {"verdict":"BLOCKED","reason":"bug real","questions":["q1","q2"]}'
  const v = extractVerdictJson(t)
  expect(v?.verdict).toBe('BLOCKED')
  expect(v?.reason).toBe('bug real')
})

test('devolve null quando nao ha veredito', () => {
  expect(extractVerdictJson('sem json aqui {"foo":1}')).toBeNull()
})

test('respeita chaves dentro de strings', () => {
  const v = extractVerdictJson('{"verdict":"APPROVED","reason":"tem } e { na string"}')
  expect(v?.verdict).toBe('APPROVED')
})

test('REGRESSAO fail-closed: gate que NAO rodou (timeout/erro) para o card', () => {
  expect(gateOutcome(gate({ ok: false, verdict: 'CONDITIONAL', reason: 'gate NAO executou (timeout)' }))).toBe('halt')
})

test('REGRESSAO fail-closed: saida sem veredito parseavel para o card', () => {
  expect(gateOutcome(gate({ ok: false, verdict: 'CONDITIONAL', reason: 'sem veredito parseavel' }))).toBe('halt')
})

test('gate rodou e reprovou: para o card', () => {
  expect(gateOutcome(gate({ ok: true, verdict: 'BLOCKED', reason: 'regressao real' }))).toBe('halt')
})

test('gate rodou e aprovou com ressalva: segue (perguntas vao no corpo do PR)', () => {
  expect(gateOutcome(gate({ ok: true, verdict: 'CONDITIONAL' }))).toBe('proceed')
})

test('gate rodou e aprovou: segue', () => {
  expect(gateOutcome(gate({ ok: true, verdict: 'APPROVED' }))).toBe('proceed')
})

test('gate sem mudanca vs a base: segue', () => {
  expect(gateOutcome(gate({ ok: true, verdict: 'APPROVED', reason: 'sem mudancas vs a base' }))).toBe('proceed')
})

test('a politica do gate final e a mesma do gate por-step (ambos fail-closed)', () => {
  const naoRodou = gate({ ok: false, verdict: 'CONDITIONAL' })
  const porStepAprova = naoRodou.ok && naoRodou.verdict !== 'BLOCKED'
  expect(porStepAprova).toBe(false)
  expect(gateOutcome(naoRodou)).toBe('halt')
})

test('REGRESSAO: timeout do gate cresce com o tamanho do diff, dentro dos limites', () => {
  const vazio = timeoutForDiff({ names: '', patch: '' })
  const pequeno = timeoutForDiff({ names: '', patch: 'x'.repeat(1024) })
  const grande = timeoutForDiff({ names: '', patch: 'x'.repeat(200 * 1024) })
  expect(vazio).toBe(180000)
  expect(pequeno).toBeGreaterThan(vazio)
  expect(grande).toBeGreaterThan(pequeno)
  expect(grande).toBeLessThanOrEqual(600000)
})

test('REGRESSAO: withGateRetry repete quando o gate nao conclui e para no primeiro veredito', async () => {
  const chamadas: GateResult[] = [
    gate({ ok: false, verdict: 'CONDITIONAL', reason: 'timeout', cost: 0.01, tokens: 10 }),
    gate({ ok: true, verdict: 'BLOCKED', reason: 'bug real', cost: 0.02, tokens: 20 }),
  ]
  let n = 0
  const motivos: string[] = []
  const r = await withGateRetry(() => Promise.resolve(chamadas[n++] as GateResult), reason => motivos.push(reason))
  expect(n).toBe(2)
  expect(r.ok).toBe(true)
  expect(r.verdict).toBe('BLOCKED')
  expect(r.cost).toBeCloseTo(0.03, 5)
  expect(r.tokens).toBe(30)
  expect(motivos).toEqual(['timeout'])
})

test('withGateRetry nao repete quando o gate conclui de primeira', async () => {
  let n = 0
  const r = await withGateRetry(() => { n++; return Promise.resolve(gate({ verdict: 'APPROVED' })) })
  expect(n).toBe(1)
  expect(r.verdict).toBe('APPROVED')
})
