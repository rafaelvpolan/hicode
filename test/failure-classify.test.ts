import { test, expect } from 'bun:test'
import { classifyFailure } from '../lib/ai/failure'

function ctx(over: { timedOut?: boolean; detail?: string; text?: string }): { timedOut: boolean; detail: string; text: string } {
  return { timedOut: false, detail: '', text: '', ...over }
}

test('timeout e sempre transiente, independente do provedor ou da mensagem', () => {
  const r = classifyFailure('claude', ctx({ timedOut: true, detail: 'invalid api key' }))
  expect(r.failureClass).toBe('transient')
})

test('ECONNRESET e transiente (rede fora)', () => {
  const r = classifyFailure('claude', ctx({ detail: 'Error: connect ECONNRESET' }))
  expect(r.failureClass).toBe('transient')
})

test('5xx do provedor e transiente', () => {
  const r = classifyFailure('codex', ctx({ text: 'upstream returned 503 service unavailable' }))
  expect(r.failureClass).toBe('transient')
})

test('429 / rate limit e transiente', () => {
  const r = classifyFailure('claude', ctx({ text: 'HTTP 429 too many requests' }))
  expect(r.failureClass).toBe('transient')
})

test('credencial invalida e terminal', () => {
  const r = classifyFailure('codex', ctx({ detail: 'Error: Unauthorized (401): invalid api key' }))
  expect(r.failureClass).toBe('terminal')
})

test('binario nao encontrado (ENOENT) e terminal', () => {
  const r = classifyFailure('codex', ctx({ detail: 'spawn codex ENOENT' }))
  expect(r.failureClass).toBe('terminal')
})

test('requisicao malformada e terminal', () => {
  const r = classifyFailure('codex', ctx({ text: 'invalid_request_error: unsupported parameter' }))
  expect(r.failureClass).toBe('terminal')
})

test('cota esgotada (generico) e um caso proprio, distinto de rede fora', () => {
  const r = classifyFailure('codex', ctx({ text: 'insufficient_quota: you exceeded your current quota' }))
  expect(r.failureClass).toBe('quota')
})

test('cota esgotada especifica da assinatura Claude', () => {
  const r = classifyFailure('claude', ctx({ text: 'Claude AI usage limit reached. Your limit will reset at 5pm.' }))
  expect(r.failureClass).toBe('quota')
})

test('ollama fora do ar (conexao recusada) e transiente', () => {
  const r = classifyFailure('ollama', ctx({ detail: 'curl: (7) Failed to connect: Connection refused' }))
  expect(r.failureClass).toBe('transient')
})

test('falha desconhecida (sem sinal nenhum) cai em terminal — errar para o lado de parar', () => {
  const r = classifyFailure('claude', ctx({ detail: 'algo deu errado', text: '' }))
  expect(r.failureClass).toBe('terminal')
})

test('terminal tem prioridade sobre transiente quando a mensagem mistura os dois sinais', () => {
  const r = classifyFailure('claude', ctx({ text: 'ECONNRESET ao renovar sessao — invalid api key' }))
  expect(r.failureClass).toBe('terminal')
})

test('cota tem prioridade sobre transiente quando a mensagem mistura os dois sinais', () => {
  const r = classifyFailure('codex', ctx({ text: '429 too many requests — insufficient_quota' }))
  expect(r.failureClass).toBe('quota')
})
