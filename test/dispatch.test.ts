import { test, expect, beforeEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handle, newSession } from '../lib/core/session'
import type { SessionState } from '../lib/core/session'

let dir = ''
let saida: string[] = []

const io = {
  log: (l: string) => { saida.push(l) },
  dim: (t: string) => t,
  color: false,
  plano: async (id: string) => [`plano do #${id}`],
  atividade: () => [],
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hicode-disp-'))
  mkdirSync(join(dir, 'runs'), { recursive: true })
  process.env.HICODE_CARDS_DIR = dir
  saida = []
})

function card(id: string, fields: Record<string, string> = {}): void {
  const fm = Object.entries({ id, status: 'READY', title: `tarefa ${id}`, repo: 'org/app', ...fields })
    .map(([k, v]) => `${k}: ${v}`).join('\n')
  writeFileSync(join(dir, `${id}-x.md`), `---\n${fm}\n---\n## Objetivo\nx\n`)
}

async function digitar(linhas: string[], inicial?: SessionState): Promise<SessionState> {
  const { dispatch } = await import('../lib/core/dispatch')
  let state = inicial ?? newSession('org/app')
  for (const linha of linhas) {
    const r = handle(linha, state)
    state = (await dispatch(r.effect, r.state, io)).state
  }
  return state
}

test('FLUXO REAL: /rm + s apaga o card do disco', async () => {
  card('025')
  await digitar(['/rm 25', 's'])
  expect(existsSync(join(dir, '025-x.md'))).toBe(false)
})

test('FLUXO REAL: card apagado sai da faixa de espera', async () => {
  const { esperandoVoce } = await import('../lib/core/render/rodape')
  const { allCards } = await import('../lib/runner/card-store')
  card('025')
  card('026')
  expect(esperandoVoce(allCards(), 'org/app').length).toBe(2)
  await digitar(['/rm 25', 's'])
  expect(esperandoVoce(allCards(), 'org/app').map(e => e.id)).toEqual(['026'])
})

test('FLUXO REAL: cancelar nao apaga', async () => {
  card('025')
  await digitar(['/rm 25', 'n'])
  expect(existsSync(join(dir, '025-x.md'))).toBe(true)
  expect(saida.join(' ')).toContain('cancelado')
})

test('FLUXO REAL: /rm de card em execucao recusa e nao apaga', async () => {
  card('025', { status: 'EXECUTING' })
  await digitar(['/rm 25'])
  expect(existsSync(join(dir, '025-x.md'))).toBe(true)
  expect(saida.join(' ')).toContain('/halt')
})

test('FLUXO REAL: /rm de card inexistente avisa', async () => {
  await digitar(['/rm 99'])
  expect(saida.join(' ')).toContain('nao encontrado')
})

test('nenhum efeito da sessao pode sumir em silencio', async () => {
  const { dispatch } = await import('../lib/core/dispatch')
  const kinds = ['submit', 'approve-plan', 'cards', 'watch', 'halt', 'plan',
    'help', 'error', 'approve-preview', 'reject-preview', 'activity', 'ask', 'answer', 'rm', 'confirm-rm']
  for (const kind of kinds) {
    saida = []
    const r = await dispatch({ kind } as never, newSession('org/app'), io)
    if (kind === 'submit') { expect(r.tratado).toBe(true); continue }
    expect(r.tratado).toBe(true)
    expect(saida.join(' ')).not.toContain('sem tratamento')
  }
})

test('efeito desconhecido grita em vez de sumir', async () => {
  const { dispatch } = await import('../lib/core/dispatch')
  await dispatch({ kind: 'inventado' } as never, newSession('org/app'), io)
  expect(saida.join(' ')).toContain('bug do hii')
})

test('quit, board e reopen-repo ficam para quem chamou', async () => {
  const { dispatch } = await import('../lib/core/dispatch')
  for (const kind of ['quit', 'board', 'reopen-repo']) {
    expect((await dispatch({ kind } as never, newSession(''), io)).tratado).toBe(false)
  }
})
