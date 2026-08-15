import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Run } from '../lib/card'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-run-falha-'))
process.env.HICODE_CARDS_DIR = CARDS

const { writeRun } = await import('../lib/runner/runs')

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

function lerDoDisco(id: string): Run {
  const dir = join(CARDS, 'runs')
  const nome = readdirSync(dir).filter(f => f.startsWith(`${id}-`)).sort().pop() ?? ''
  return JSON.parse(readFileSync(join(dir, nome), 'utf8')) as Run
}

test('run que falhou grava classe e motivo — o registro deixa de dizer apenas "ok: false"', () => {
  writeRun('001', {
    ok: false,
    cost: '0.0100',
    reason: 'usage limit reached',
    failureClass: 'quota',
    failureReason: 'limite de uso da assinatura Claude atingido',
    provider: 'claude',
    model: 'opus',
  })
  const gravado = lerDoDisco('001')
  expect(gravado.ok).toBe(false)
  expect(gravado.failure_class).toBe('quota')
  expect(gravado.failure_reason).toBe('limite de uso da assinatura Claude atingido')
  expect(gravado.provider).toBe('claude')
})

test('run que deu certo nao carrega motivo de falha', () => {
  writeRun('002', { ok: true, cost: '1.0000', provider: 'codex', model: 'gpt' })
  const gravado = lerDoDisco('002')
  expect(gravado.failure_class).toBe('')
  expect(gravado.failure_reason).toBe('')
})

test('provedor ausente e gravado vazio — quem le decide o que fazer com o desconhecido', () => {
  writeRun('003', { ok: false, cost: '0.0100', failureClass: 'terminal', failureReason: 'credencial invalida' })
  const gravado = lerDoDisco('003')
  expect(gravado.provider).toBe('')
  expect(gravado.failure_class).toBe('terminal')
})
