import { test, expect, beforeEach } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

beforeEach(() => {
  process.env.HICODE_CARDS_DIR = mkdtempSync(join(tmpdir(), 'hicode-tipo-'))
  delete process.env.HICODE_CLASSIFY
})
import { lerEntrada, pareceTarefa } from '../lib/core/tipo-de-prompt'

const tarefa = pareceTarefa

test('REGRESSAO a pergunta que virou tarefa e gastou dinheiro', () => {
  expect(tarefa('tem acesso a o NTN da Podium para criar tarefas?')).toBe(false)
})

test('perguntas sao reconhecidas como perguntas', () => {
  for (const p of [
    'tem acesso ao banco?',
    'qual e o modelo usado no gate?',
    'como funciona o worktree?',
    'da pra rodar isso local?',
    'voce sabe se o preview subiu?',
    'e possivel usar dois provedores?',
    'existe teste para isso?',
    'por que o card parou?',
  ]) expect(tarefa(p), p).toBe(false)
})

test('tarefas de verdade continuam passando', () => {
  for (const t of [
    'remova o header de beta no topo da pagina',
    'adicionar um selo beta no hero',
    'corrige o erro do build',
    'muda a brand do site para hii',
    'criar o design system base',
    'ajusta o alinhamento do rodape',
    'atualiza a dependencia do vite',
    'implementa login com google',
  ]) expect(tarefa(t), t).toBe(true)
})

test('pergunta que pede mudanca ainda e tarefa', () => {
  expect(tarefa('pode remover o selo beta?')).toBe(true)
  expect(tarefa('consegue corrigir o build?')).toBe(true)
  expect(tarefa('da pra adicionar um badge no header?')).toBe(true)
})

test('acento nao muda a leitura', () => {
  expect(tarefa('é possível ver o preview?')).toBe(false)
  expect(tarefa('atualizá a versão do node')).toBe(true)
})

test('texto vazio nao vira tarefa', () => {
  expect(tarefa('   ')).toBe(false)
})

test('a leitura explica o motivo', () => {
  expect(lerEntrada('tem acesso?').motivo).toContain('consultando')
  expect(lerEntrada('remove o selo').motivo).toContain('mudanca')
})

test('frase declarativa sem verbo de acao nao e barrada', () => {
  expect(tarefa('o rodape esta desalinhado no mobile')).toBe(true)
  expect(tarefa('erro 500 na home apos o deploy')).toBe(true)
})

test('a distincao que importa: consulta versus pedido', () => {
  expect(lerEntrada('tem acesso ao NTN para criar tarefas?').tipo).toBe('ask')
  expect(lerEntrada('pode criar a tarefa do NTN?').tipo).toBe('task')
})

test('pedido sem verbo de mudanca e pergunta de viabilidade', () => {
  expect(tarefa('da pra rodar isso local?')).toBe(false)
  expect(tarefa('consegue ver o preview?')).toBe(false)
})

test('quero e gostaria contam como pedido', () => {
  expect(tarefa('quero remover o selo beta')).toBe(true)
  expect(tarefa('gostaria de atualizar o vite')).toBe(true)
})

test('o tipo ask NAO cria card e nao oferece aprovar nem rejeitar', async () => {
  const { handle, newSession } = await import('../lib/core/session')
  const { dispatch } = await import('../lib/core/dispatch')
  const { allCards } = await import('../lib/runner/card-store')
  const saida: string[] = []
  const { dispatchIOFalso } = await import('./fixtures/dispatch-io-falso')
  const io = dispatchIOFalso({ log: (l: string) => { saida.push(l) } })
  const antes = allCards().length
  const r = handle('tem acesso ao NTN para criar tarefas?', newSession('org/app'))
  await dispatch(r.effect, r.state, io)
  const texto = saida.join(' ')
  expect(allCards().length).toBe(antes)
  expect(texto).toContain('nao criei card')
  expect(texto).not.toContain('enter')
  expect(texto).not.toContain('aprova')
  expect(texto).not.toContain('rejeit')
})

test('o tipo task segue criando card normalmente', async () => {
  const { handle, newSession } = await import('../lib/core/session')
  const r = handle('remove o selo beta do header', newSession('org/app'))
  expect(r.effect.kind).toBe('confirmar-tarefa')
  const { lerEntrada } = await import('../lib/core/tipo-de-prompt')
  expect(lerEntrada(r.effect.text ?? '').tipo).toBe('task')
})

test('cada tipo tem uma descricao propria', async () => {
  const { TIPOS } = await import('../lib/core/tipo-de-prompt')
  expect(Object.keys(TIPOS)).toEqual(['task', 'ask'])
  expect(TIPOS.ask).not.toContain('respondida')
})

test('/new-task cria a tarefa direto, sem passar pela leitura de intencao', async () => {
  const { handle, newSession } = await import('../lib/core/session')
  const r = handle('/new-task tem acesso ao NTN?', newSession('org/app'))
  expect(r.effect.kind).toBe('submit')
  expect(r.effect.text).toBe('tem acesso ao NTN?')
})

test('/new-task sem texto explica o uso em vez de criar card vazio', async () => {
  const { handle, newSession } = await import('../lib/core/session')
  const r = handle('/new-task', newSession('org/app'))
  expect(r.effect.kind).toBe('error')
  expect(r.effect.text).toContain('/new-task')
})

test('/new-ask pergunta sem criar card', async () => {
  const { handle, newSession } = await import('../lib/core/session')
  const { dispatch } = await import('../lib/core/dispatch')
  const { dispatchIOFalso } = await import('./fixtures/dispatch-io-falso')
  const { allCards } = await import('../lib/runner/card-store')
  const saida: string[] = []
  const antes = allCards().length
  const r = handle('/new-ask qual modelo o gate usa?', newSession('org/app'))
  expect(r.effect.kind).toBe('ask')
  await dispatch(r.effect, r.state, dispatchIOFalso({
    log: (l) => { saida.push(l) },
    responder: async (p) => [`resposta sobre: ${p}`],
  }))
  expect(allCards().length).toBe(antes)
  expect(saida.join(' ')).toContain('resposta sobre: qual modelo o gate usa?')
})

test('/new-ask sem pergunta nao chama a ia', async () => {
  const { handle, newSession } = await import('../lib/core/session')
  const r = handle('/new-ask', newSession('org/app'))
  expect(r.effect.kind).toBe('error')
})

test('/new-session e tratado por quem chamou, nao pelo despachante', async () => {
  const { handle, newSession } = await import('../lib/core/session')
  const { dispatch } = await import('../lib/core/dispatch')
  const { dispatchIOFalso } = await import('./fixtures/dispatch-io-falso')
  const r = handle('/new-session', newSession('org/app'))
  expect(r.effect.kind).toBe('nova-sessao')
  expect((await dispatch(r.effect, r.state, dispatchIOFalso())).tratado).toBe(false)
})

test('os tres comandos novos estao no catalogo e no autocompletar', async () => {
  const { COMMANDS } = await import('../lib/core/session')
  const { AJUDA_DO_COMANDO } = await import('../lib/core/render/sugestoes')
  const lista: string[] = [...COMMANDS]
  for (const c of ['/new-task', '/new-ask', '/new-session']) {
    expect(lista, c).toContain(c)
    expect(AJUDA_DO_COMANDO[c], c).toBeTruthy()
  }
})

test('REGRESSAO texto de tarefa cria o card — nao cai em "bug do hii"', async () => {
  const { handle, newSession } = await import('../lib/core/session')
  const { dispatch } = await import('../lib/core/dispatch')
  const { dispatchIOFalso } = await import('./fixtures/dispatch-io-falso')
  const { allCards } = await import('../lib/runner/card-store')
  const saida: string[] = []
  const antes = allCards().length
  const r = handle('estou me referindo a conexao com o notion', newSession('org/app'))
  const d = await dispatch(r.effect, r.state, dispatchIOFalso({ log: (l) => { saida.push(l) } }))
  const texto = saida.join(' ')
  expect(texto).not.toContain('bug do hii')
  expect(texto).not.toContain('sem tratamento')
  expect(texto).toContain('criado')
  expect(allCards().length).toBe(antes + 1)
  expect(d.state.pendingPlan).toBeTruthy()
})

test('REGRESSAO o efeito submit tem dono no despachante', async () => {
  const { dispatch } = await import('../lib/core/dispatch')
  const { dispatchIOFalso } = await import('./fixtures/dispatch-io-falso')
  const { newSession } = await import('../lib/core/session')
  const saida: string[] = []
  await dispatch({ kind: 'submit', text: 'remove o selo' }, newSession('org/app'),
    dispatchIOFalso({ log: (l) => { saida.push(l) } }))
  expect(saida.join(' ')).not.toContain('sem tratamento')
})

test('submit sem projeto avisa em vez de criar card orfao', async () => {
  const { dispatch } = await import('../lib/core/dispatch')
  const { dispatchIOFalso } = await import('./fixtures/dispatch-io-falso')
  const { newSession } = await import('../lib/core/session')
  const { allCards } = await import('../lib/runner/card-store')
  const saida: string[] = []
  const antes = allCards().length
  await dispatch({ kind: 'submit', text: 'algo' }, newSession(''),
    dispatchIOFalso({ log: (l) => { saida.push(l) } }))
  expect(saida.join(' ')).toContain('sem projeto')
  expect(allCards().length).toBe(antes)
})
