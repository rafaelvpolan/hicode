import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lerTecnico, salvarTecnico, iniciarEnvio, registrarEnvio } from '../panel/server/hii/tecnico-store'
import { serializarTecnico } from '../panel/shared/contrato-tecnico'
import type { DocumentoTecnico } from '../panel/shared/contrato-tecnico'
let dir = ''
let anterior: string | undefined
beforeEach(() => { anterior = process.env.HICODE_CARDS_DIR; dir = mkdtempSync(join(tmpdir(), 'hicode-tecnico-')); process.env.HICODE_CARDS_DIR = dir })
afterEach(() => { if (anterior === undefined) delete process.env.HICODE_CARDS_DIR; else process.env.HICODE_CARDS_DIR = anterior; rmSync(dir, { recursive: true, force: true }) })
function fonte(): string {
  const d: DocumentoTecnico = { versao: 1, id: 'tecnico-a', repo: 'org/app', produtoId: 'A',
    origem: { planejamento: 'principal', revisao: 3 }, titulo: 'Triagem', solucao: 'Classificar entradas',
    contexto: 'Entradas sem categoria', escopo: 'Novas entradas', exclusoes: 'Historico', referencias: [], dependencias: [],
    riscos: 'Erro de classificacao', risco: 'low',
    criterios: [{ id: 'categoria', descricao: 'Classifica entradas novas', resultado: 'Categoria correta registrada',
      verificacao: 'Teste com entrada conhecida', verificador: 'test', obrigatorio: true }],
    microtasks: [{ id: 'impl', titulo: 'Classificar', instrucao: 'Implementar classificacao', saida: 'Codigo e testes',
      agente: 'limpio', dependeDe: [], arquivos: [], criterios: ['categoria'] }],
    operacao: { e2e: 'Conferir categoria esperada', observabilidade: 'Medir classificacoes incorretas',
      logging: 'Log sem dados pessoais', flags: 'Ativar apenas para piloto', ativacao: 'Revisao humana necessaria',
      sucesso: 'Nenhuma categoria incorreta', interrupcao: 'Parar em categoria incorreta', reversao: 'Desativar a flag do piloto' } }
  return serializarTecnico(d)
}
test('rascunho preserva fonte; aprovacao exige campos completos e escopo correto', () => {
  const incompleta = fonte().replace('Classificar entradas', '')
  expect(salvarTecnico('org/app', 'principal', 'A', incompleta, 0, 'rascunho-01', false).fonte).toBe(incompleta)
  expect(() => salvarTecnico('org/app', 'principal', 'A', incompleta, 1, 'aprovar-001', true)).toThrow('solucao')
  expect(() => iniciarEnvio('org/app', 'principal', 'A', 1)).toThrow('Aprove')
  expect(() => salvarTecnico('org/outro', 'principal', 'A', fonte(), 0, 'escopo-001', true)).toThrow('escopo')
})
test('revisao otimista e chave de intencao impedem sobrescrita concorrente', () => {
  const r = salvarTecnico('org/app', 'principal', 'A', fonte(), 0, 'revisao-001', true)
  expect(salvarTecnico('org/app', 'principal', 'A', fonte(), 0, 'revisao-001', true)).toEqual(r)
  expect(() => salvarTecnico('org/app', 'principal', 'A', fonte(), 0, 'revisao-002', false)).toThrow('Outro editor')
  expect(() => salvarTecnico('org/app', 'principal', 'A', fonte(), 1, 'revisao-001', false)).toThrow('outra intencao')
})
test('envio sobrevive releitura, retenta com mesma chave e nao altera revisao anterior', () => {
  const original = salvarTecnico('org/app', 'principal', 'A', fonte(), 0, 'revisao-001', true)
  const r = iniciarEnvio('org/app', 'principal', 'A', 1)
  expect(r.envio).not.toBeNull()
  expect(lerTecnico('org/app', 'principal', 'A')?.envio).toEqual(r.envio)
  expect(iniciarEnvio('org/app', 'principal', 'A', 1).envio?.chave).toBe(r.envio!.chave)
  const confirmado = { ...r.envio!, estado: 'confirmado' as const, sessao: '001', execucao: '002', status: 'EXECUTING' }
  registrarEnvio('org/app', 'principal', 'A', 1, confirmado)
  expect(iniciarEnvio('org/app', 'principal', 'A', 1).envio).toEqual(confirmado)
  expect(() => registrarEnvio('org/app', 'principal', 'A', 1, r.envio!)).toThrow('confirmado')
  const nova = salvarTecnico('org/app', 'principal', 'A', fonte().replace('Classificar entradas', 'Classificar entradas novas'), 1, 'revisao-002', false)
  expect(nova.aprovada).toBe(false)
  expect(nova.envio).toBeNull()
  const antiga = registrarEnvio('org/app', 'principal', 'A', 1, confirmado)
  expect(antiga.fonte).toBe(original.fonte)
  expect(lerTecnico('org/app', 'principal', 'A')?.revisao).toBe(2)
})

test('retry conserva vinculos de dependencia fixados na intencao original', () => {
  salvarTecnico('org/app', 'principal', 'A', fonte(), 0, 'revisao-deps-001', true)
  const refs = [{ produto: 'anterior', execucao: '002', tecnicoHash: 'a'.repeat(64) }]
  const primeiro = iniciarEnvio('org/app', 'principal', 'A', 1, refs)
  const repetido = iniciarEnvio('org/app', 'principal', 'A', 1, [{ ...refs[0]!, execucao: '003' }])
  expect(repetido.envio?.chave).toBe(primeiro.envio?.chave)
  expect(repetido.envio?.dependencias).toEqual(refs)
  expect(lerTecnico('org/app', 'principal', 'A')?.envio?.dependencias).toEqual(refs)
})
