import { test, expect } from 'bun:test'
import { consultarConfiguracao } from '../panel/server/hii/configuracao'
import { motivoDeInelegibilidade, rotuloDeCapacidade, rotuloDeCarga, rotuloDeIdentidade, rotuloDeLocalidade } from '../panel/shared/configuracao-hii'
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
    configuracao: async () => ({ etag: '"rev1"', valor: { versao: 1, preferencias: {}, aplicacao: 'novos despachos',
      execucao: { localidade: 'somente_local', fallbackRemoto: false, editavel: false } } }),
    provedores: async () => ({ valor: { provedores: [] } }),
  })
  expect(r.disponivel).toBe(true)
  expect(r.escrita).toBe(false)
  expect(r.etag).toBe('"rev1"')
  expect(r.configuracao?.execucao).toEqual({ localidade: 'somente_local', fallbackRemoto: false, editavel: false })
})
test('Ollama sem ferramentas nao e elegivel para edicao nem JSON; geracao continua disponivel', () => {
  const p = { nome: 'ollama', situacao: 'disponivel', comoObter: '', modelo: '', modelos: [],
    aptidao: { agentic: false, isolatesReadonly: true, emitsStructuredJson: false, restrictsTools: false } }
  expect(motivoDeInelegibilidade(p, 'implement')).toContain('edicao')
  expect(motivoDeInelegibilidade(p, 'verify')).toContain('JSON')
  expect(motivoDeInelegibilidade(p, 'step')).toBe('')
  expect(rotuloDeLocalidade(p)).toContain('indeterminada')
  expect(rotuloDeLocalidade({ ...p, localidade: 'verificada' })).toContain('verificada')
  expect(rotuloDeCapacidade({ ...p, inferencia: { servidor: 'http://localhost:11434', modelo: 'qwen', limiteServidor: 2, limiteModelo: 1, emUsoNoServidor: 1, emUsoNoModelo: 1, disponivel: false, configuracaoValida: true } })).toContain('fila ocupada')
  expect(rotuloDeIdentidade({ ...p, modelo: 'qwen:7b', identidadeInferencia: { endpoint: 'http://127.0.0.1:11434', versao: '0.12.3', verificadoEm: Date.now(), origem: 'servidor', modelos: [{ nome: 'qwen:7b', digest: 'sha256:abcdef' }] } })).toContain('qwen:7b (sha256:abcdef)')
  expect(rotuloDeCarga({ ...p, modelo: 'qwen:7b', identidadeInferencia: { endpoint: 'http://127.0.0.1:11434', versao: '0.12.3', verificadoEm: Date.now(), origem: 'servidor', modelos: [], carga: [{ nome: 'qwen:7b', sizeVram: 4_294_967_296, tamanho: 5_000_000_000, expiraEm: null }], memoriaLivre: null } })).toContain('4.0 GiB de VRAM do modelo · VRAM livre desconhecida')
})
