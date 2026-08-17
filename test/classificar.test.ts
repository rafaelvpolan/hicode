import { test, expect, beforeEach } from 'bun:test'
import { classificarPrompt, promptDeClassificacao, lerRotulo } from '../lib/core/classificar'

beforeEach(() => { process.env.HICODE_CLASSIFY = 'on' })

test('confianca alta nao gasta chamada de ia', async () => {
  let chamou = 0
  const consultar = async (): Promise<string> => { chamou++; return 'ask' }
  const r = await classificarPrompt('remove o selo beta do header', consultar)
  expect(r.tipo).toBe('task')
  expect(chamou).toBe(0)
})

test('duvida consulta a ia local e o rotulo dela prevalece', async () => {
  const r = await classificarPrompt('estou me referindo a conexao com o notion', async () => 'ask')
  expect(r.tipo).toBe('ask')
  expect(r.motivo).toContain('ia local')
  expect(r.confianca).toBe('alta')
})

test('quando a ia concorda, o motivo registra a concordancia', async () => {
  const r = await classificarPrompt('o rodape esta desalinhado', async () => 'task')
  expect(r.tipo).toBe('task')
  expect(r.motivo).toContain('concordou')
})

test('classificador desligado nao consulta nada', async () => {
  process.env.HICODE_CLASSIFY = 'off'
  let chamou = 0
  const r = await classificarPrompt('estou me referindo ao notion', async () => { chamou++; return 'ask' })
  expect(chamou).toBe(0)
  expect(r.confianca).toBe('baixa')
})

test('resposta ambigua da ia nao troca a leitura', async () => {
  for (const bruto of ['task ask', 'sei nao', '', 'talvez seja task ou ask']) {
    const r = await classificarPrompt('estou me referindo ao notion', async () => bruto)
    expect(r.tipo, bruto).toBe('task')
  }
})

test('ia fora do ar nao derruba a classificacao', async () => {
  const r = await classificarPrompt('estou me referindo ao notion', async () => {
    throw new Error('ollama fora do ar')
  })
  expect(r.tipo).toBe('task')
  expect(r.confianca).toBe('baixa')
})

test('sem consultor, cai no heuristico', async () => {
  const r = await classificarPrompt('estou me referindo ao notion')
  expect(r.confianca).toBe('baixa')
})

test('o rotulo e lido de resposta suja do modelo', () => {
  expect(lerRotulo('task')).toBe('task')
  expect(lerRotulo('  ASK\n')).toBe('ask')
  expect(lerRotulo('Resposta: task')).toBe('task')
  expect(lerRotulo('acho que e ask, porque...')).toBe('ask')
  expect(lerRotulo('task ou ask')).toBe(null)
  expect(lerRotulo('nao sei')).toBe(null)
})

test('o prompt pede uma palavra e explica os dois rotulos', () => {
  const p = promptDeClassificacao('teste')
  expect(p).toContain('task')
  expect(p).toContain('ask')
  expect(p).toContain('UMA palavra')
  expect(p).toContain('teste')
})
