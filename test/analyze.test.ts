import { test, expect } from 'bun:test'
import { planSteps } from '../lib/runner/analyze'
import type { TaskInput } from '../lib/runner/analyze'
import { DEFAULT_STEPS } from '../lib/runner/pipeline/config'

function ids(task: TaskInput): string[] {
  return planSteps(task, DEFAULT_STEPS).steps.map(s => s.id)
}

test('trocar um texto -> enxuto: pula seguranca, arquitetura e testes', () => {
  const p = planSteps({ title: 'trocar o texto do botao apoiar', risk: 'low' }, DEFAULT_STEPS)
  expect(p.profile).toBe('enxuto')
  expect(p.steps.map(s => s.id)).not.toContain('seguranca')
  expect(p.steps.map(s => s.id)).not.toContain('arquitetura')
  expect(p.steps.map(s => s.id)).not.toContain('testes')
})

test('typo/ortografia -> enxuto', () => {
  expect(planSteps({ title: 'corrige o typo no rodape', risk: 'low' }, DEFAULT_STEPS).profile).toBe('enxuto')
})

test('login/senha/jwt -> mantem seguranca e testes', () => {
  const i = ids({ title: 'adiciona login com senha e jwt', risk: 'low' })
  expect(i).toContain('seguranca')
  expect(i).toContain('testes')
})

test('novo endpoint na api -> mantem seguranca e testes', () => {
  const i = ids({ title: 'cria endpoint de cadastro na api', risk: 'low' })
  expect(i).toContain('seguranca')
  expect(i).toContain('testes')
})

test('mudanca so visual (surface=visual) -> pula seguranca', () => {
  const i = ids({ title: 'muda a cor do hero', surface: 'visual', risk: 'low' })
  expect(i).not.toContain('seguranca')
  expect(i).not.toContain('testes')
})

test('bump de dependencias -> deps: testes + seguranca(CVE), sem arquitetura', () => {
  const p = planSteps({ title: 'atualiza o pacote vitest e o lockfile', risk: 'low' }, DEFAULT_STEPS)
  expect(p.profile).toBe('deps')
  expect(p.steps.map(s => s.id)).toContain('testes')
  expect(p.steps.map(s => s.id)).toContain('seguranca')
  expect(p.steps.map(s => s.id)).not.toContain('arquitetura')
})

test('risco alto -> completo, roda todos os passos', () => {
  const p = planSteps({ title: 'trocar um texto', risk: 'high' }, DEFAULT_STEPS)
  expect(p.profile).toBe('completo')
  expect(p.steps.length).toBe(DEFAULT_STEPS.length)
})

test('ambiguo (sem sinais) -> mantem seguranca por seguranca', () => {
  const i = ids({ title: 'melhora o apoiar', risk: 'low' })
  expect(i).toContain('seguranca')
  expect(i).toContain('review')
})

test('override "all" no card forca todos os passos', () => {
  const p = planSteps({ title: 'trocar um texto', risk: 'low', override: 'all' }, DEFAULT_STEPS)
  expect(p.steps.length).toBe(DEFAULT_STEPS.length)
})

test('override lista roda exatamente os ids informados', () => {
  const p = planSteps({ title: 'trocar um texto', risk: 'low', override: 'testes,review' }, DEFAULT_STEPS)
  expect(p.steps.map(s => s.id).sort()).toEqual(['review', 'testes'])
})

test('migration/schema -> mantem seguranca e testes', () => {
  const i = ids({ title: 'adiciona migration com nova coluna no schema', risk: 'low' })
  expect(i).toContain('seguranca')
  expect(i).toContain('testes')
})
