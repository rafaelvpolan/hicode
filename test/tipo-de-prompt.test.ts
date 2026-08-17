import { test, expect } from 'bun:test'
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
  const io = {
    log: (l: string) => { saida.push(l) }, dim: (t: string) => t, color: false,
    largura: () => 78, plano: async () => [], atividade: () => [],
    subirPreview: async () => '', listarPreviews: async () => [],
  }
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
