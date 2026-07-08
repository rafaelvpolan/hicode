import { test, expect } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadPipeline, activeSteps } from '../lib/runner/pipeline/config'

test('loadPipeline sempre devolve ao menos os steps default', () => {
  expect(loadPipeline().steps.length).toBeGreaterThan(0)
})

test('override por projeto respeita ordem e desativa steps', () => {
  const d = mkdtempSync(join(tmpdir(), 'wt-'))
  mkdirSync(join(d, '.hicode'), { recursive: true })
  writeFileSync(join(d, '.hicode', 'pipeline.json'), JSON.stringify({
    version: 1,
    steps: [
      { id: 'b', label: 'B', kind: 'quality', agent: 'pura', state: 'CLEANED', gate: 'none', enabled: true, instruction: 'y' },
      { id: 'a', label: 'A', kind: 'quality', agent: 'rufus', state: 'REFINED', gate: 'none', enabled: true, instruction: 'x' },
      { id: 'c', label: 'C', kind: 'quality', agent: 'crivo', state: 'REVIEWED', gate: 'none', enabled: false, instruction: 'z' },
    ],
  }))
  expect(activeSteps(d).map(s => s.label)).toEqual(['B', 'A'])
})

test('override invalido cai no default', () => {
  const d = mkdtempSync(join(tmpdir(), 'wt2-'))
  mkdirSync(join(d, '.hicode'), { recursive: true })
  writeFileSync(join(d, '.hicode', 'pipeline.json'), '{ nao é json valido')
  expect(loadPipeline(d).steps.length).toBeGreaterThan(0)
})

test('step com state fora do enum e descartado (cai no default)', () => {
  const d = mkdtempSync(join(tmpdir(), 'wt3-'))
  mkdirSync(join(d, '.hicode'), { recursive: true })
  writeFileSync(join(d, '.hicode', 'pipeline.json'), JSON.stringify({
    version: 1,
    steps: [{ id: 'x', label: 'X', kind: 'quality', agent: 'rufus', state: 'FOO', gate: 'none', enabled: true, instruction: 'z' }],
  }))
  expect(loadPipeline(d).steps.every(s => s.state !== 'FOO')).toBe(true)
})
