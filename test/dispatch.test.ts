import { test, expect, beforeEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handle, newSession } from '../lib/core/session'
import type { SessionState } from '../lib/core/session'
import { dispatchIOFalso } from './fixtures/dispatch-io-falso'

let dir = ''
let saida: string[] = []

const io = dispatchIOFalso({
  log: (l: string) => { saida.push(l) },
  plano: async (id: string) => [`plano do #${id}`],
})

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

test('quit e board ficam para quem chamou; o resto o despachante trata', async () => {
  const { dispatch } = await import('../lib/core/dispatch')
  for (const kind of ['quit', 'board']) {
    expect((await dispatch({ kind } as never, newSession(''), io)).tratado).toBe(false)
  }
  expect((await dispatch({ kind: 'reopen-repo' } as never, newSession(''), io)).tratado).toBe(true)
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
  card('022', { status: 'EXECUTED', worktree: dir })
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

test('apagar a tarefa aberta tira voce de dentro dela', async () => {
  const { seguir } = await import('../lib/core/session')
  card('022')
  const state = await digitar(['/rm 22', ''], seguir(newSession('org/app'), '022'))
  expect(state.seguindo).toBe('')
  expect(saida.join(' ')).toContain('voltando ao board')
})

test('apagar OUTRA tarefa nao tira voce da que esta aberta', async () => {
  const { seguir } = await import('../lib/core/session')
  card('022'); card('023')
  const state = await digitar(['/rm 23', ''], seguir(newSession('org/app'), '022'))
  expect(state.seguindo).toBe('022')
})

test('instrucao em tarefa que sumiu vira tarefa nova, sem perder o texto', async () => {
  const { seguir } = await import('../lib/core/session')
  const { allCards } = await import('../lib/runner/card-store')
  const state = await digitar(['tira tambem o do hero'], seguir(newSession('org/app'), '099'))
  const novos = allCards()
  expect(novos.length).toBe(1)
  const idNovo = novos[0]?.id
  if (idNovo === undefined) throw new Error('a instrucao perdida nao virou tarefa nova com id')
  expect(novos[0]?.title).toBe('tira tambem o do hero')
  expect(state.seguindo).toBe(idNovo)
  expect(saida.join(' ')).toContain('virou tarefa nova')
})

test('a tarefa nova nasce parada, esperando aprovacao', async () => {
  const { seguir } = await import('../lib/core/session')
  const { allCards } = await import('../lib/runner/card-store')
  await digitar(['qualquer coisa'], seguir(newSession('org/app'), '099'))
  expect(allCards()[0]?.status).toBe('READY')
  expect(saida.join(' ')).toContain('enter aprova')
})

test('sem projeto, instrucao orfa nao cria nada', async () => {
  const { seguir } = await import('../lib/core/session')
  const { allCards } = await import('../lib/runner/card-store')
  await digitar(['texto solto'], seguir(newSession(''), '099'))
  expect(allCards().length).toBe(0)
  expect(saida.join(' ')).toContain('sem projeto')
})

test('retomar so vale para tarefa parada', async () => {
  const { readCard } = await import('../lib/runner/card-store')
  const { retomando } = await import('../lib/core/session')
  card('022', { status: 'HALTED' })
  await digitar([''], retomando(newSession('org/app'), '022'))
  expect(readCard('022')?.fm.status).toBe('EXECUTING')
})

test('retomar tarefa que nao esta parada nao mexe no estado', async () => {
  const { readCard } = await import('../lib/runner/card-store')
  const { retomando } = await import('../lib/core/session')
  card('022', { status: 'PREVIEW' })
  await digitar([''], retomando(newSession('org/app'), '022'))
  expect(readCard('022')?.fm.status).toBe('PREVIEW')
  expect(saida.join(' ')).toContain('nao ha o que retomar')
})

test('retomar card inexistente avisa', async () => {
  const { retomando } = await import('../lib/core/session')
  await digitar([''], retomando(newSession('org/app'), '099'))
  expect(saida.join(' ')).toContain('nao encontrado')
})

const REGISTRO = [{ name: 'acme/site', path: '/tmp/site' }, { name: 'acme/api', path: '/tmp/api' }]

function comRepos(): void {
  writeFileSync(join(dir, '..', 'repos-teste.json'), JSON.stringify(REGISTRO))
  process.env.HICODE_REPOS_FILE = join(dir, '..', 'repos-teste.json')
}

test('escolher projeto por numero muda o alvo', async () => {
  comRepos()
  const state = await digitar(['/repo', '2'])
  expect(state.repo).toBe('acme/api')
  expect(saida.join(' ')).toContain('projeto agora e acme/api')
})

test('escolher projeto por nome parcial funciona quando e unico', async () => {
  comRepos()
  expect((await digitar(['/repo api'])).repo).toBe('acme/api')
})

test('nome que combina com varios pede desempate em vez de chutar', async () => {
  comRepos()
  const state = await digitar(['/repo acme'])
  expect(state.repo).toBe('org/app')
  expect(saida.join(' ')).toContain('combina com 2 projetos')
})

test('projeto nao registrado e RECUSADO, com a lista do que existe', async () => {
  comRepos()
  const state = await digitar(['/repo qualquer/coisa'])
  expect(state.repo).toBe('org/app')
  expect(saida.join(' ')).toContain('nao esta registrado')
  expect(saida.join(' ')).toContain('acme/site')
  expect(saida.join(' ')).toContain('hii repo add')
})

test('trocar de projeto solta a tarefa aberta do projeto anterior', async () => {
  comRepos()
  const { seguir } = await import('../lib/core/session')
  const state = await digitar(['/repo 1'], seguir(newSession('org/app'), '022'))
  expect(state.repo).toBe('acme/site')
  expect(state.seguindo).toBe('')
})

test('/repo sem argumento lista os projetos registrados', async () => {
  comRepos()
  const state = await digitar(['/repo'])
  expect(state.escolhendo).toBe(true)
  expect(saida.join(' ')).toContain('acme/site')
  expect(saida.join(' ')).toContain('acme/api')
})

test('sem projeto registrado, ensina a registrar', async () => {
  writeFileSync(join(dir, '..', 'repos-vazio.json'), '[]')
  process.env.HICODE_REPOS_FILE = join(dir, '..', 'repos-vazio.json')
  await digitar(['/repo'])
  expect(saida.join(' ')).toContain('nenhum projeto registrado')
})

test('FLUXO: aprovar pelo numero 1 aprova o preview', async () => {
  const { aprovando, seguir } = await import('../lib/core/session')
  const { readCard } = await import('../lib/runner/card-store')
  card('022', { status: 'PREVIEW' })
  const inicial = aprovando(seguir(newSession('org/app'), '022'), '022')
  const state = await digitar(['1'], inicial)
  expect(readCard('022')?.fm.status).toBe('PREVIEW_OK')
  expect(state.aprovando).toBe('')
})

test('FLUXO: recusar pelo 2 manda refazer', async () => {
  const { aprovando, seguir } = await import('../lib/core/session')
  const { readCard } = await import('../lib/runner/card-store')
  card('022', { status: 'PREVIEW' })
  await digitar(['2'], aprovando(seguir(newSession('org/app'), '022'), '022'))
  expect(readCard('022')?.fm.status).not.toBe('PREVIEW_OK')
})

test('FLUXO: recusar pelo 3 pede o comentario, e o texto vira o motivo', async () => {
  const { aprovando, seguir } = await import('../lib/core/session')
  const { readCard } = await import('../lib/runner/card-store')
  card('022', { status: 'PREVIEW', worktree: dir })
  let state = aprovando(seguir(newSession('org/app'), '022'), '022')
  state = await digitar(['3'], state)
  expect(state.comentando).toBe('022')
  expect(saida.join(' ')).toContain('escreva o que precisa ajustar')
  state = await digitar(['o selo ficou desalinhado'], state)
  expect(state.comentando).toBe('')
  const c = readCard('022')
  const guardou = String(c?.fm.correction ?? '') + (c?.body ?? '')
  expect(guardou).toContain('desalinhado')
})

test('FLUXO: enter vazio desiste do comentario sem recusar', async () => {
  const { comentando, seguir } = await import('../lib/core/session')
  const { readCard } = await import('../lib/runner/card-store')
  card('022', { status: 'PREVIEW' })
  const state = await digitar([''], comentando(seguir(newSession('org/app'), '022'), '022'))
  expect(state.comentando).toBe('')
  expect(readCard('022')?.fm.status).toBe('PREVIEW')
})

test('FLUXO: enter dentro da tarefa faz a acao obvia de cada estado', async () => {
  const { seguir } = await import('../lib/core/session')
  const { readCard } = await import('../lib/runner/card-store')
  card('030', { status: 'PREVIEW' })
  await digitar([''], seguir(newSession('org/app'), '030'))
  expect(readCard('030')?.fm.status).toBe('PREVIEW_OK')

  card('031', { status: 'HALTED' })
  await digitar([''], seguir(newSession('org/app'), '031'))
  expect(readCard('031')?.fm.status).toBe('EXECUTING')

  card('032', { status: 'READY' })
  await digitar([''], seguir(newSession('org/app'), '032'))
  expect(readCard('032')?.fm.status).not.toBe('READY')
})

test('FLUXO: enter em tarefa rodando nao mexe em nada', async () => {
  const { seguir } = await import('../lib/core/session')
  const { readCard } = await import('../lib/runner/card-store')
  card('022', { status: 'EXECUTING' })
  await digitar([''], seguir(newSession('org/app'), '022'))
  expect(readCard('022')?.fm.status).toBe('EXECUTING')
  expect(saida.join(' ')).toContain('nada para aprovar agora')
})
