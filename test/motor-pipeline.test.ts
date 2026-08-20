import { test, expect, afterEach } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { pipelineAtual } = await import('../panel/server/motor/pipeline')

interface PipelineConfigDeTeste {
  version: number
  steps: Array<Record<string, string | boolean | string[]>>
}

let base = ''

afterEach(() => {
  delete process.env.HII_HOME
  if (base) rmSync(base, { recursive: true, force: true })
  base = ''
})

function comHiiHome(config?: PipelineConfigDeTeste): void {
  base = mkdtempSync(join(tmpdir(), 'hicode-motor-pipeline-'))
  process.env.HII_HOME = base
  if (config === undefined) return
  mkdirSync(join(base, 'config'), { recursive: true })
  writeFileSync(join(base, 'config', 'pipeline.json'), JSON.stringify(config))
}

test('sem config/pipeline.json no HII_HOME, cai no padrao embutido de 5 passos', () => {
  comHiiHome()
  const r = pipelineAtual()
  expect(r.fonte).toBe('padrao-embutido')
  expect(r.steps).toHaveLength(5)
})

test('config/pipeline.json existe mas todo step e invalido — reporta lista vazia de verdade, nao troca pelo padrao', () => {
  comHiiHome({ version: 1, steps: [{ id: 'sem-campos-obrigatorios' }] })
  const r = pipelineAtual()
  expect(r.fonte).toBe('config/pipeline.json')
  expect(r.steps).toEqual([])
})

test('le o pipeline.json do HII_HOME (a raiz que o motor realmente usa), nao a raiz do painel', () => {
  comHiiHome({
    version: 3,
    steps: [{ id: 'x', label: 'X', agent: 'rufus', state: 'REFINED', gate: 'none', enabled: true, gated: true, needs: [] }],
  })
  const r = pipelineAtual()
  expect(r.version).toBe(3)
  expect(r.steps.map(s => s.id)).toEqual(['x'])
})
