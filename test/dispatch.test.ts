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
  largura: () => 78,
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
  expect(saida.join(' ')).toContain('/stop')
})

test('FLUXO REAL: /rm de card inexistente avisa', async () => {
  await digitar(['/rm 99'])
  expect(saida.join(' ')).toContain('#099 nao existe')
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

test('LOTE: /rm com varios ids apaga todos', async () => {
  card('023'); card('024'); card('025')
  await digitar(['/rm 23 24 25', 's'])
  for (const id of ['023', '024', '025']) expect(existsSync(join(dir, `${id}-x.md`))).toBe(false)
})

test('LOTE: id repetido nao conta duas vezes', async () => {
  card('023')
  await digitar(['/rm 23 23 023', 's'])
  expect(saida.join(' ')).toContain('apagar 1 tarefa')
})

test('LOTE: card em execucao fica de fora, o resto vai', async () => {
  card('023'); card('024', { status: 'EXECUTING' })
  await digitar(['/rm 23 24', 's'])
  expect(existsSync(join(dir, '023-x.md'))).toBe(false)
  expect(existsSync(join(dir, '024-x.md'))).toBe(true)
  expect(saida.join(' ')).toContain('#024 em EXECUTING, fica')
})

test('LOTE: --force leva tambem o que estava em execucao', async () => {
  card('023', { status: 'EXECUTING' })
  await digitar(['/rm 23 --force', 's'])
  expect(existsSync(join(dir, '023-x.md'))).toBe(false)
})

test('LOTE: id inexistente e avisado sem travar os outros', async () => {
  card('023')
  await digitar(['/rm 23 99', 's'])
  expect(saida.join(' ')).toContain('#099 nao existe')
  expect(existsSync(join(dir, '023-x.md'))).toBe(false)
})

test('LOTE: nenhum alvo valido nao pede confirmacao', async () => {
  const state = await digitar(['/rm 98 99'])
  expect(saida.join(' ')).toContain('nada a apagar')
  expect(state.removendo).toBe('')
})

test('LOTE: cancelar preserva todos', async () => {
  card('023'); card('024')
  await digitar(['/rm 23 24', 'n'])
  expect(existsSync(join(dir, '023-x.md'))).toBe(true)
  expect(existsSync(join(dir, '024-x.md'))).toBe(true)
})

test('LOTE: confirmacao relata quantos foram', async () => {
  card('023'); card('024')
  await digitar(['/rm 23 24', 's'])
  expect(saida.join(' ')).toContain('2 apagada(s)')
})

test('FLUXO REAL: instrucao dentro da tarefa entra como sub-prompt, sem confirmar', async () => {
  const { subPrompts } = await import('../lib/core/instruir')
  const { readCard } = await import('../lib/runner/card-store')
  const { seguir } = await import('../lib/core/session')
  card('022', { status: 'EXECUTED' })
  await digitar(['tira tambem o do hero'], seguir(newSession('org/app'), '022'))
  const c = readCard('022')
  expect(subPrompts(c?.body ?? '')).toEqual(['tira tambem o do hero'])
  expect(c?.fm.status).toBe('CORRECTING')
  expect(saida.join(' ')).toContain('instrucao 1 anotada')
})

test('FLUXO REAL: nenhuma tarefa nova nasce de uma instrucao', async () => {
  const { allCards } = await import('../lib/runner/card-store')
  const { seguir } = await import('../lib/core/session')
  card('022', { status: 'EXECUTED' })
  const antes = allCards().length
  await digitar(['muda mais isso', 'e aquilo'], seguir(newSession('org/app'), '022'))
  expect(allCards().length).toBe(antes)
})
