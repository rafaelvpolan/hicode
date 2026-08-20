import { test, expect } from 'bun:test'
import {
  estadoDeServico, executarComando, sondarComSeguranca, sondarListaComSeguranca, sondarStatusUnicoComSeguranca,
} from '../panel/server/servicos/executar'

test('executarComando devolve ok=true e stdout do comando quando ele termina com sucesso', async () => {
  const resultado = await executarComando('node', ['-e', 'process.stdout.write("ola")'])
  expect(resultado.ok).toBe(true)
  expect(resultado.stdout).toBe('ola')
})

test('executarComando devolve ok=false quando o comando termina com exit code diferente de zero', async () => {
  const resultado = await executarComando('node', ['-e', 'process.exit(3)'])
  expect(resultado.ok).toBe(false)
})

test('executarComando devolve ok=false quando o comando nem existe no PATH, sem lancar excecao', async () => {
  const resultado = await executarComando('este-binario-nao-existe-de-verdade', [])
  expect(resultado.ok).toBe(false)
})

test('executarComando respeita o timeoutMs — comando que nao termina e encerrado e reportado como falha', async () => {
  const inicio = Date.now()
  const resultado = await executarComando('node', ['-e', 'setInterval(() => {}, 1000)'], 50)
  const duracaoMs = Date.now() - inicio
  expect(resultado.ok).toBe(false)
  expect(duracaoMs).toBeLessThan(3000)
})

test('estadoDeServico monta o objeto com comoResolver vazio por padrao quando nao informado', () => {
  expect(estadoDeServico('X', 'ok', 'tudo certo')).toEqual({ nome: 'X', estado: 'ok', detalhe: 'tudo certo', comoResolver: '' })
})

test('sondarComSeguranca devolve o valor da sonda quando ela resolve dentro do prazo', async () => {
  const resultado = await sondarComSeguranca('X', 1000, async () => 'valor-real', motivo => `falhou: ${motivo}`)
  expect(resultado).toBe('valor-real')
})

test('sondarComSeguranca cai no fallback quando a sonda rejeita, sem propagar a excecao para quem chamou', async () => {
  const resultado = await sondarComSeguranca('X', 1000, async () => { throw new Error('quebrou') }, motivo => motivo)
  expect(resultado).toContain('sonda falhou: quebrou')
})

test('sondarComSeguranca cai no fallback quando a sonda excede o timeoutMs, mesmo que a promessa nunca resolva', async () => {
  const inicio = Date.now()
  const resultado = await sondarComSeguranca('X', 50, () => new Promise<string>(() => {}), motivo => motivo)
  const duracaoMs = Date.now() - inicio
  expect(resultado).toContain('excedeu 50ms')
  expect(duracaoMs).toBeLessThan(3000)
})

test('sondarStatusUnicoComSeguranca traduz o timeout em StatusDeServico com estado "desconhecido"', async () => {
  const resultado = await sondarStatusUnicoComSeguranca('Servico X', 50, () => new Promise(() => {}))
  expect(resultado.nome).toBe('Servico X')
  expect(resultado.estado).toBe('desconhecido')
  expect(resultado.detalhe).toContain('excedeu 50ms')
})

test('sondarListaComSeguranca traduz o timeout numa lista de um StatusDeServico "desconhecido"', async () => {
  const resultado = await sondarListaComSeguranca('Servico Y', 50, () => new Promise(() => {}))
  expect(resultado).toHaveLength(1)
  expect(resultado[0]?.estado).toBe('desconhecido')
})
