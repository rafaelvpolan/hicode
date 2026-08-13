import { test, expect } from 'bun:test'
import { extractVerdictJson, gateOutcome } from '../lib/runner/codefox-gate'
import type { GateResult } from '../lib/runner/codefox-gate'

function gate(over: Partial<GateResult>): GateResult {
  return { ok: true, verdict: 'APPROVED', reason: '', questions: [], cost: 0, tokens: 0, ...over }
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
