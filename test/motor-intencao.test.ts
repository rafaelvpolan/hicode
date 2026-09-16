import { test, expect } from 'bun:test'
import { enviarIntencao, lerIntencao } from '../panel/shared/intencao'
import type { ArmazenamentoDeIntencao, ComandoDoPainel } from '../panel/shared/intencao'

function armazenamento(): ArmazenamentoDeIntencao {
  const dados = new Map<string, string>()
  return { getItem: k => dados.get(k) ?? null, setItem: (k, v) => { dados.set(k, v) }, removeItem: k => { dados.delete(k) } }
}
test('timeout depois do efeito remoto reutiliza sessao e execucao sem duplicar', async () => {
  const storage = armazenamento()
  const remoto = new Map<string, { id: string }>()
  const chamadas: ComandoDoPainel[] = []
  let perderResposta = true
  const enviar = async (c: ComandoDoPainel): Promise<{ id: string }> => {
    chamadas.push(c)
    if (!remoto.has(c.chave)) remoto.set(c.chave, { id: String(remoto.size + 1).padStart(3, '0') })
    if (c.acao === 'pedido' && perderResposta) { perderResposta = false; throw new Error('timeout') }
    return remoto.get(c.chave)!
  }
  const p = { texto: 'implementar', modo: 'gateway' as const, sessao: '' }
  await expect(enviarIntencao(storage, 'org/app', p, enviar)).rejects.toThrow('timeout')
  expect(lerIntencao(storage, 'org/app')?.sessao).toBe('001')
  const r = await enviarIntencao(storage, 'org/app', p, enviar)
  expect(r.id).toBe('002')
  expect(remoto.size).toBe(2)
  expect(chamadas.filter(c => c.acao === 'pedido').map(c => c.chave)[0]).toBe(chamadas.at(-1)?.chave)
  expect(lerIntencao(storage, 'org/app')).toBeNull()
})
test('nova sessao com resposta perdida reutiliza a mesma chave', async () => {
  const s = armazenamento()
  const p = { texto: 'x', modo: 'orquestrador' as const, sessao: '' }
  let chave = ''
  await expect(enviarIntencao(s, 'org/app', p, async c => { chave = c.chave; throw new Error('rede') })).rejects.toThrow()
  let primeira = ''
  await enviarIntencao(s, 'org/app', p, async c => { primeira ||= c.chave; return { id: '001' } })
  expect(primeira).toBe(chave)
})
test('pedido alterado nao reutiliza chave nem cria efeito; outro projeto e independente', async () => {
  const s = armazenamento()
  const p = { texto: 'x', modo: 'ask' as const, sessao: '' }
  await expect(enviarIntencao(s, 'org/app', p, async () => { throw new Error('rede') })).rejects.toThrow()
  let efeitos = 0
  const enviar = async (): Promise<{ id: string }> => { efeitos++; return { id: '001' } }
  await expect(enviarIntencao(s, 'org/app', { ...p, texto: 'y' }, enviar)).rejects.toThrow('intencao original')
  expect(efeitos).toBe(0)
  await enviarIntencao(s, 'org/outro', p, enviar)
  expect(efeitos).toBe(2)
})
test('duplo clique nao dispara um segundo POST em voo', async () => {
  const s = armazenamento()
  let liberar: () => void = () => {}
  const espera = new Promise<void>(r => { liberar = r })
  const p = { texto: 'x', modo: 'ask' as const, sessao: '' }
  let efeitos = 0
  const enviar = async (): Promise<{ id: string }> => { efeitos++; await espera; return { id: '001' } }
  const primeiro = enviarIntencao(s, 'org/app', p, enviar)
  await expect(enviarIntencao(s, 'org/app', p, enviar)).rejects.toThrow('sendo enviado')
  liberar()
  await primeiro
  expect(efeitos).toBe(2)
})

test('perguntas criam sessao duravel e as seguintes reutilizam seu identificador', async () => {
  const s = armazenamento()
  const chamadas: ComandoDoPainel[] = []
  const enviar = async (c: ComandoDoPainel): Promise<{ id: string }> => {
    chamadas.push(c)
    return { id: c.acao === 'nova_sessao' ? 'sessao-001' : 'consulta-001' }
  }
  const primeira = await enviarIntencao(s, 'org/app', { texto: 'contexto', modo: 'ask', sessao: '' }, enviar)
  expect(primeira.sessao).toBe('sessao-001')
  expect(chamadas[1]?.id).toBe('sessao-001')
  await enviarIntencao(s, 'org/app', { texto: 'continue', modo: 'ask', sessao: primeira.sessao }, enviar)
  expect(chamadas.map(c => c.acao)).toEqual(['nova_sessao', 'perguntar', 'perguntar'])
  expect(chamadas[2]?.id).toBe('sessao-001')
})
