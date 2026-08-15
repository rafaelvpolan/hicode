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

test('instrucao em tarefa com worktree vivo vira correcao', async () => {
  const { instruir } = await import('../lib/core/instruir')
  const { readCard } = await import('../lib/runner/card-store')
  card('022', { status: 'EXECUTED', worktree: dir })
  const r = instruir('022', 'tira tambem o do hero')
  expect(r.ok).toBe(true)
  expect(r.reexecuta).toBe(true)
  expect(r.refaz).toBe(false)
  const c = readCard('022')
  expect(c?.fm.status).toBe('CORRECTING')
  expect(c?.fm.correction).toBe('tira tambem o do hero')
})

test('REGRESSAO sem worktree, instrucao REFAZ em vez de virar correcao morta', async () => {
  const { instruir } = await import('../lib/core/instruir')
  const { readCard } = await import('../lib/runner/card-store')
  card('022', { status: 'HALTED', worktree: '/caminho/que/nao/existe' })
  const r = instruir('022', 'retome e me mostre o preview')
  expect(r.refaz).toBe(true)
  const c = readCard('022')
  expect(c?.fm.status).toBe('EXECUTING')
  expect(c?.fm.correction ?? '').toBe('')
  expect(c?.body).toContain('sem worktree — refazendo do zero')
})

test('card sem campo de worktree tambem refaz', async () => {
  const { instruir } = await import('../lib/core/instruir')
  const { readCard } = await import('../lib/runner/card-store')
  card('022', { status: 'HALTED' })
  expect(instruir('022', 'continue').refaz).toBe(true)
  expect(readCard('022')?.fm.status).toBe('EXECUTING')
})

test('REGRESSAO paste multilinha vira UMA instrucao, nao sete', async () => {
  const { instruir, subPrompts } = await import('../lib/core/instruir')
  const { readCard } = await import('../lib/runner/card-store')
  card('022', { status: 'HALTED' })
  instruir('022', 'deu erro:\nApp.vue:97:7\n95 |\n96 |  <EngineConsole />\n   |   ^')
  const subs = subPrompts(readCard('022')?.body ?? '')
  expect(subs.length).toBe(1)
  expect(subs[0]).toContain('App.vue:97:7')
  expect(subs[0]).toContain('EngineConsole')
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
  card('022', { worktree: dir })
  instruir('022', 'primeira coisa')
  expect(readCard('022')?.body).toContain('instrucao 1: primeira coisa')
})

test('umaLinha preserva o conteudo e marca as quebras', async () => {
  const { umaLinha } = await import('../lib/core/instruir')
  expect(umaLinha('linha um\nlinha dois')).toBe('linha um ⏎ linha dois')
  expect(umaLinha('  espacos   demais  ')).toBe('espacos demais')
  expect(umaLinha('so uma')).toBe('so uma')
})

test('texto colado chega INTEIRO na instrucao, nao o marcador', async () => {
  const { newInput, keypress } = await import('../lib/core/tui/input')
  const { marcarCola } = await import('../lib/core/tui/keys')
  const { instruir, subPrompts } = await import('../lib/core/instruir')
  const { readCard } = await import('../lib/runner/card-store')
  const erro = 'deu erro:\nApp.vue:97:7\n95 |\n96 |  <EngineConsole />'

  let s = newInput()
  for (const c of 'arruma isso: ') s = keypress(s, c).state
  s = keypress(s, marcarCola(erro)).state
  expect(s.buffer).toContain('[colado #1')
  const enviado = keypress(s, '\r').action

  card('022', { status: 'HALTED' })
  instruir('022', enviado.kind === 'submit' ? enviado.line : '')
  const subs = subPrompts(readCard('022')?.body ?? '')
  expect(subs.length).toBe(1)
  expect(subs[0]).toContain('arruma isso:')
  expect(subs[0]).toContain('App.vue:97:7')
  expect(subs[0]).toContain('EngineConsole')
  expect(subs[0]).not.toContain('[colado')
})

test('varios pastes na mesma linha chegam todos', async () => {
  const { newInput, keypress } = await import('../lib/core/tui/input')
  const { marcarCola } = await import('../lib/core/tui/keys')
  const { umaLinha } = await import('../lib/core/instruir')
  let s = newInput()
  s = keypress(s, marcarCola('primeiro bloco\ncom duas linhas')).state
  for (const c of ' e ') s = keypress(s, c).state
  s = keypress(s, marcarCola('segundo bloco\ntambem grande')).state
  const enviado = keypress(s, '\r').action
  const texto = umaLinha(enviado.kind === 'submit' ? enviado.line : '')
  expect(texto).toContain('primeiro bloco')
  expect(texto).toContain('segundo bloco')
  expect(texto).not.toContain('[colado')
})

test('paste curto nao vira marcador, entra direto', async () => {
  const { newInput, keypress } = await import('../lib/core/tui/input')
  const { marcarCola } = await import('../lib/core/tui/keys')
  const s = keypress(newInput(), marcarCola('http://localhost:5222')).state
  expect(s.buffer).toBe('http://localhost:5222')
  expect(s.buffer).not.toContain('[colado')
})
