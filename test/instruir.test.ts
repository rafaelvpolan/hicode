import { test, expect, beforeEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { subPrompts, anexarSubPrompt } from '../lib/core/instruir'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hicode-inst-'))
  mkdirSync(join(dir, 'runs'), { recursive: true })
  process.env.HICODE_CARDS_DIR = dir
})

function card(id: string, fields: Record<string, string> = {}, body = '## Objetivo\nfazer algo\n'): void {
  const fm = Object.entries({ id, status: 'EXECUTING', title: `tarefa ${id}`, repo: 'org/app', ...fields })
    .map(([k, v]) => `${k}: ${v}`).join('\n')
  writeFileSync(join(dir, `${id}-x.md`), `---\n${fm}\n---\n\n${body}`)
}

test('primeiro sub-prompt cria a secao numerada', () => {
  const body = anexarSubPrompt('## Objetivo\nfazer\n', 'tira o selo')
  expect(body).toContain('## Instrucoes')
  expect(body).toContain('1. tira o selo')
})

test('sub-prompts seguintes continuam a numeracao', () => {
  let body = '## Objetivo\nfazer\n'
  for (const t of ['um', 'dois', 'tres']) body = anexarSubPrompt(body, t)
  expect(subPrompts(body)).toEqual(['um', 'dois', 'tres'])
  expect(body).toContain('3. tres')
})

test('sub-prompt nao invade a secao seguinte do card', () => {
  const body = anexarSubPrompt('## Objetivo\nfazer\n\n## Log de Estado\n2026 CREATED\n', 'tira o selo')
  expect(body.indexOf('## Instrucoes')).toBeLessThan(body.indexOf('## Log de Estado'))
  expect(body).toContain('2026 CREATED')
  expect(subPrompts(body)).toEqual(['tira o selo'])
})

test('card sem instrucoes devolve lista vazia', () => {
  expect(subPrompts('## Objetivo\nfazer\n')).toEqual([])
})

test('instrucao em tarefa executando manda reexecutar', async () => {
  const { instruir } = await import('../lib/core/instruir')
  const { readCard } = await import('../lib/runner/card-store')
  card('022', { status: 'EXECUTED' })
  const r = instruir('022', 'tira tambem o do hero')
  expect(r.ok).toBe(true)
  expect(r.reexecuta).toBe(true)
  const c = readCard('022')
  expect(c?.fm.status).toBe('CORRECTING')
  expect(c?.fm.correction).toBe('tira tambem o do hero')
})

test('instrucao antes de executar so anota, sem forcar correcao', async () => {
  const { instruir } = await import('../lib/core/instruir')
  const { readCard } = await import('../lib/runner/card-store')
  for (const status of ['READY', 'CLARIFY', 'PLAN_APPROVED']) {
    card('030', { status })
    const r = instruir('030', 'considera o mobile tambem')
    expect(r.reexecuta).toBe(false)
    expect(readCard('030')?.fm.status).toBe(status)
    expect(subPrompts(readCard('030')?.body ?? '')).toEqual(['considera o mobile tambem'])
  }
})

test('tarefa entregue recusa instrucao e explica', async () => {
  const { instruir } = await import('../lib/core/instruir')
  for (const status of ['MERGED', 'DEPLOYED']) {
    card('020', { status })
    const r = instruir('020', 'muda mais uma coisa')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('tarefa nova')
  }
})

test('instrucao vazia nao suja o card', async () => {
  const { instruir } = await import('../lib/core/instruir')
  card('022')
  expect(instruir('022', '   ').ok).toBe(false)
})

test('card inexistente nao explode', async () => {
  const { instruir } = await import('../lib/core/instruir')
  expect(instruir('777', 'x').ok).toBe(false)
})

test('cada instrucao entra no log de estado do card', async () => {
  const { instruir } = await import('../lib/core/instruir')
  const { readCard } = await import('../lib/runner/card-store')
  card('022')
  instruir('022', 'primeira coisa')
  expect(readCard('022')?.body).toContain('instrucao 1: primeira coisa')
})
