import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { novaDescoberta, validarPlanejamento, proporEpico, pendenciasDaDescoberta } from '../panel/shared/planejamento'
import type { Planejamento } from '../panel/shared/planejamento'
import { lerPlanejamento, salvarPlanejamento } from '../panel/server/hii/planejamento-store'
let dir = ''
let anterior: string | undefined
beforeEach(() => { anterior = process.env.HICODE_CARDS_DIR; dir = mkdtempSync(join(tmpdir(), 'hicode-plano-')); process.env.HICODE_CARDS_DIR = dir })
afterEach(() => { if (anterior === undefined) delete process.env.HICODE_CARDS_DIR; else process.env.HICODE_CARDS_DIR = anterior; rmSync(dir, { recursive: true, force: true }) })
function plano(): Planejamento { return { versao: 1, id: 'principal', repo: 'org/app', descoberta: novaDescoberta(), epico: null } }
function completo(): Planejamento {
  const p = plano()
  p.descoberta.titulo = 'Reducao de retrabalho'
  for (const c of Object.keys(p.descoberta.respostas) as (keyof typeof p.descoberta.respostas)[]) p.descoberta.respostas[c] = 'Informacao fornecida pelo operador; fonte entrevista 1'
  return p
}
test('demanda vaga gera perguntas; respostas existentes nao sao perguntadas novamente', () => {
  const d = novaDescoberta()
  expect(pendenciasDaDescoberta(d).length).toBe(9)
  d.titulo = 'Melhorar atendimento'; d.respostas.publico = 'Equipe de suporte'
  expect(pendenciasDaDescoberta(d).some(p => p.campo === 'publico')).toBe(false)
})
test('rascunho recarrega e nao cria card executavel; aprovacao exige respostas', () => {
  const p = plano()
  expect(salvarPlanejamento(p, 0, 'rascunho-001', false).revisao).toBe(1)
  expect(lerPlanejamento(p.repo, p.id)?.documento).toEqual(p)
  expect(readdirSync(dir)).toEqual(['planejamento'])
  expect(() => salvarPlanejamento(p, 1, 'aprovar-001', true)).toThrow('campos')
})
test('retry idempotente, conflito de edicao e isolamento de projeto preservam a revisao', () => {
  const p = completo()
  const r = salvarPlanejamento(p, 0, 'aprovar-001', true)
  expect(salvarPlanejamento(p, 0, 'aprovar-001', true).hash).toBe(r.hash)
  const novo = structuredClone(p); novo.descoberta.decisoes = 'Nova decisao'
  expect(() => salvarPlanejamento(novo, 0, 'outra-chave', false)).toThrow('Outro editor')
  expect(() => salvarPlanejamento(novo, 1, 'aprovar-001', false)).toThrow('outra intencao')
  expect(salvarPlanejamento(novo, 1, 'segunda-chave', false).descobertaAprovada).toBe(false)
  expect(lerPlanejamento('org/outro', p.id)).toBeNull()
})
test('epico exige sintese aprovada, criterios e grafo sem ciclos', () => {
  const p = completo()
  salvarPlanejamento(p, 0, 'aprovar-001', true)
  const e = proporEpico(p.descoberta)
  Object.assign(e, { objetivo: 'Reduzir espera', resultado: 'Fila menor', metrica: 'p95 abaixo de 1h', escopo: 'Atendimento inicial' })
  e.tarefas = [{ id: 'A', titulo: 'Triagem', resultado: 'Classificar entradas', prioridade: 'alta', justificativa: 'Desbloqueia atendimento', dependeDe: [], criterios: ['Quando a entrada for recebida, a categoria esperada deve ser registrada.'] },
    { id: 'B', titulo: 'Resposta', resultado: 'Exibir resposta', prioridade: 'media', justificativa: 'Depende da triagem', dependeDe: ['A'], criterios: ['Quando triada, a entrada deve exibir resposta com prazo de uma hora.'] }]
  p.epico = e
  expect(validarPlanejamento(p)).toEqual([])
  const salvo = salvarPlanejamento(p, 1, 'epico-chave', false)
  expect(salvo.revisaoDaSintese).toBe(1)
  expect(salvarPlanejamento(p, 1, 'epico-chave', false).revisao).toBe(2)
  e.tarefas[0]!.dependeDe = ['B']
  expect(validarPlanejamento(p).some(v => v.mensagem.includes('Ciclo'))).toBe(true)
})
test('edicao da descoberta invalida aprovacao e impede alterar epico silenciosamente', () => {
  const p = completo()
  salvarPlanejamento(p, 0, 'aprovar-001', true)
  p.descoberta.respostas.dor = 'Problema novo'
  const r = salvarPlanejamento(p, 1, 'alterar-001', false)
  expect(r.descobertaAprovada).toBe(false)
  expect(r.revisaoDaSintese).toBeNull()
})
