import { test, expect } from 'bun:test'
import { lerAcaoExterna, instrucaoDe } from '../lib/runner/externo'
import { planSteps } from '../lib/runner/analyze'
import { classifySurface } from '../lib/runner/classify'
import type { PipelineStep } from '../lib/runner/pipeline/types'

const passo = (id: string, label: string, kind: PipelineStep['kind'], agent: string): PipelineStep => ({
  id, label, kind, agent, state: 'REFINED', gate: 'none', enabled: true, instruction: '',
})

const PASSOS: PipelineStep[] = [
  passo('arquitetura', 'Arquitetura', 'quality', 'limpio'),
  passo('testes', 'Testes', 'quality', 'testudo'),
  passo('seguranca', 'Seguranca', 'security', 'escudo'),
  passo('review', 'Review', 'review', 'crivo'),
  passo('limpeza', 'Limpeza', 'cleanup', 'pura'),
]

const plano = (title: string, objetivo = '', risk = 'low'): ReturnType<typeof planSteps> =>
  planSteps({ title, objetivo, risk, surface: 'visual', override: 'auto' }, PASSOS)

test('instrucao e a primeira linha — o resto do prompt e conteudo, nao trabalho no repo', () => {
  const bruto = 'use o conector MCP: criar tarefa no notion\n1. mexer no banco\n2. fazer testes'
  expect(instrucaoDe(bruto)).toBe('use o conector MCP: criar tarefa no notion')
})

test('acao externa reconhecida pela ferramenta + acao + artefato', () => {
  const r = lerAcaoExterna('criar nova tarefa no notion como subtask de FASE 3', '')
  expect(r.externo).toBe(true)
  expect(r.ferramenta).toBe('notion')
})

test('conector MCP conta como ponte mesmo sem a ferramenta nomeada', () => {
  expect(lerAcaoExterna('use o conector MCP para criar um card', '').externo).toBe(true)
})

test('implementar integracao NAO e acao externa — e codigo no repo', () => {
  expect(lerAcaoExterna('implementar a integracao com a api do notion', '').externo).toBe(false)
  expect(lerAcaoExterna('refatorar o cliente do slack', '').externo).toBe(false)
})

test('mencao a ferramenta sem acao sobre artefato nao e acao externa', () => {
  expect(lerAcaoExterna('melhorar o layout da pagina de login', '').externo).toBe(false)
  expect(lerAcaoExterna('o notion esta lento', '').externo).toBe(false)
})

test('REGRESSAO #023: acao externa nao abre Arquitetura, Testes nem Seguranca', () => {
  const p = plano(
    'ok, use o conector MCP para fazer isso: Criar nova tarefa no notion como subtask de Podium skills - FASE 3:',
    'Titulo: Ordenacao de trilha\n1. criar botao de ordenacao\n5. ordem armazenada no banco\n6. Fazer testes',
  )
  expect(p.profile).toBe('externo')
  expect(p.steps).toEqual([])
  expect(p.skipped).toContain('Arquitetura')
  expect(p.skipped).toContain('Testes')
  expect(p.skipped).toContain('Seguranca')
})

test('REGRESSAO #023: o conteudo do card nao arrasta a tarefa para backend/dados', () => {
  const p = plano('criar tarefa no notion', 'ordem armazenada no banco, fazer testes, endpoint da api')
  expect(p.reason).not.toContain('backend/dados')
  expect(p.profile).toBe('externo')
})

test('acao externa nao levanta preview — nao ha superficie para renderizar', () => {
  const v = classifySurface('criar nova tarefa no notion', 'Titulo: Ordenacao de trilha', true)
  expect(v.surface).toBe('none')
})

test('risk high explicito do humano ainda vence a acao externa', () => {
  expect(plano('criar tarefa no notion', '', 'high').profile).toBe('completo')
})

test('trabalho de codigo de verdade continua abrindo as fases', () => {
  const p = plano('criar endpoint de pagamento', 'validar o schema no banco')
  expect(p.profile).toBe('padrao')
  expect(p.steps.map(s => s.id)).toContain('seguranca')
  expect(p.steps.map(s => s.id)).toContain('testes')
})
