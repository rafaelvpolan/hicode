import { test, expect } from 'bun:test'
import { consultarConfiguracao } from '../panel/server/hii/configuracao'
import { motivoDeInelegibilidade } from '../panel/shared/configuracao-hii'
test('servidor antigo nao recebe consultas ou escritas de configuracao', async () => {
  let chamadas = 0
  const r = await consultarConfiguracao({
    capacidades: async () => ({ valor: { versao: 1 } }),
    configuracao: async () => { chamadas++; throw new Error('nao suportado') },
    provedores: async () => { chamadas++; return { valor: { provedores: [] } } },
  })
  expect(r.disponivel).toBe(false)
  expect(chamadas).toBe(0)
})
test('permissao de leitura conserva ETag e nao concede escrita', async () => {
  const r = await consultarConfiguracao({
    capacidades: async () => ({ valor: { versao: 1, configuracao: { versoes: [1], leitura: true, escrita: false } } }),
    configuracao: async () => ({ etag: '"rev1"', valor: { versao: 1, preferencias: {}, aplicacao: 'novos despachos' } }),
    provedores: async () => ({ valor: { provedores: [] } }),
  })
  expect(r.disponivel).toBe(true)
  expect(r.escrita).toBe(false)
  expect(r.etag).toBe('"rev1"')
})
test('Ollama sem ferramentas nao e elegivel para edicao nem JSON; geracao continua disponivel', () => {
  const p = { nome: 'ollama', situacao: 'disponivel', comoObter: '', modelo: '', modelos: [],
    aptidao: { agentic: false, isolatesReadonly: true, emitsStructuredJson: false, restrictsTools: false } }
  expect(motivoDeInelegibilidade(p, 'implement')).toContain('edicao')
  expect(motivoDeInelegibilidade(p, 'verify')).toContain('JSON')
  expect(motivoDeInelegibilidade(p, 'step')).toBe('')
})
