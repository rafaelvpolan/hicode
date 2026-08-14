import { test, expect } from 'bun:test'
import { waves } from '../lib/runner/pipeline/waves'
import { DEFAULT_STEPS } from '../lib/runner/pipeline/config'
import { buildPlan } from '../lib/core/plan'
import { renderPlan } from '../lib/core/render/plan'
import type { Card } from '../lib/card'
import type { PipelineStep } from '../lib/runner/pipeline/types'

function card(fm: Record<string, string>, objetivo = 'fazer algo'): Card {
  return { fm: { id: '042', ...fm }, order: Object.keys(fm), body: `## Objetivo\n${objetivo}\n`, file: '042-x.md' }
}

function step(id: string, needs: string[]): PipelineStep {
  return { id, label: id, kind: 'quality', agent: 'a', state: 'REFINED', gate: 'none', enabled: true, needs, instruction: '' }
}

test('waves: cadeia linear vira uma onda por passo', () => {
  const w = waves([step('a', []), step('b', ['a']), step('c', ['b'])])
  expect(w.map(x => x.map(s => s.id))).toEqual([['a'], ['b'], ['c']])
})

test('waves: dois passos com a mesma dependencia rodam na mesma onda', () => {
  const w = waves([step('a', []), step('b', ['a']), step('c', ['a'])])
  expect(w.map(x => x.map(s => s.id))).toEqual([['a'], ['b', 'c']])
})

test('waves: dependencia ausente do plano nao trava a onda', () => {
  const w = waves([step('b', ['arquitetura-que-foi-pulada'])])
  expect(w.map(x => x.map(s => s.id))).toEqual([['b']])
})

test('waves: ciclo nao entra em loop infinito', () => {
  const w = waves([step('a', ['b']), step('b', ['a'])])
  expect(w.flat().length).toBe(2)
})

test('waves do pipeline default: testes e seguranca em paralelo apos arquitetura', () => {
  const w = waves(DEFAULT_STEPS).map(x => x.map(s => s.id))
  expect(w[0]).toEqual(['arquitetura'])
  expect(w[1]).toEqual(['testes', 'seguranca'])
  expect(w[2]).toEqual(['review'])
  expect(w[3]).toEqual(['limpeza'])
})

test('plano: card de backend mantem seguranca e testes', () => {
  const p = buildPlan({ card: card({ title: 'cria endpoint de cadastro na api', repo: 'org/app' }), hasDevServer: false })
  const ids = p.waves.flatMap(w => w.steps.map(s => s.id))
  expect(ids).toContain('seguranca')
  expect(ids).toContain('testes')
})

test('plano: card cosmetico entra em perfil enxuto e pula qualidade', () => {
  const p = buildPlan({ card: card({ title: 'corrige o typo do rodape', repo: 'org/app' }), hasDevServer: true })
  expect(p.profile).toBe('enxuto')
  expect(p.skipped).toContain('Testes')
})

test('plano: layout sugerido em visual subjetivo, mas nunca ligado sozinho', () => {
  const p = buildPlan({ card: card({ title: 'deixar o hero mais chamativo', repo: 'org/app' }), hasDevServer: true })
  expect(p.layout.on).toBe(false)
  expect(p.layout.reason).toContain('sugerido')
})

test('plano: layout respeitado quando o humano liga no card', () => {
  const p = buildPlan({ card: card({ title: 'hero novo', repo: 'org/app', layout: 'on' }), hasDevServer: true })
  expect(p.layout.on).toBe(true)
  expect(p.layout.reason).toBe('ligado no card')
})

test('plano: pilha sugerida acima do teto de arquivos, nunca ligada sozinha', () => {
  const p = buildPlan({ card: card({ title: 'refatora modulo', repo: 'org/app' }), hasDevServer: false, fileCount: 45 })
  expect(p.pilha.on).toBe(false)
  expect(p.pilha.reason).toContain('sugerido')
})

test('render: mostra objetivo, flags, paralelo e que nada rodou', () => {
  const p = buildPlan({ card: card({ title: 'cria endpoint de cadastro na api', repo: 'org/app' }, 'expor POST /cadastro'), hasDevServer: false })
  const t = renderPlan(p)
  expect(t).toContain('PLANO · card #042')
  expect(t).toContain('expor POST /cadastro')
  expect(t).toContain('org/app')
  expect(t).toContain('paralelo')
  expect(t).toContain('Nada foi executado.')
})

test('render sem cor nao emite escape ANSI', () => {
  const p = buildPlan({ card: card({ title: 'typo no rodape', repo: 'org/app' }), hasDevServer: true })
  expect(renderPlan(p, { color: false })).not.toContain('\x1b[')
})

test('render com cor emite escape ANSI', () => {
  const p = buildPlan({ card: card({ title: 'typo no rodape', repo: 'org/app' }), hasDevServer: true })
  expect(renderPlan(p, { color: true })).toContain('\x1b[')
})

test('REGRESSAO objetivo multilinha nao quebra o layout do bloco', () => {
  const c = card({ title: 'hero', repo: 'org/app' }, 'Altere o titulo do hero para:\nPrompts resolvem\nmais uma linha')
  const linhas = renderPlan(buildPlan({ card: c, hasDevServer: true })).split('\n')
  const objetivo = linhas.filter(l => l.includes('Objetivo'))
  expect(objetivo.length).toBe(1)
  expect(objetivo[0]).toContain('Altere o titulo do hero para: Prompts resolvem')
})

test('REGRESSAO objetivo longo e truncado dentro da largura', () => {
  const c = card({ title: 'x', repo: 'org/app' }, 'a'.repeat(400))
  for (const l of renderPlan(buildPlan({ card: c, hasDevServer: true })).split('\n')) {
    expect(l.length).toBeLessThanOrEqual(80)
  }
})

test('REGRESSAO colunas alinham com e sem cor (escape nao conta como largura)', () => {
  const semCor = renderPlan(buildPlan({ card: card({ title: 'hero novo', repo: 'org/app', layout: 'on' }), hasDevServer: true }))
  const comCor = renderPlan(buildPlan({ card: card({ title: 'hero novo', repo: 'org/app', layout: 'on' }), hasDevServer: true }), { color: true })
  const visivel = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')
  const linha = (t: string, k: string): string => visivel(t.split('\n').find(l => visivel(l).includes(k)) ?? '')
  expect(linha(comCor, 'Layout')).toBe(linha(semCor, 'Layout'))
  expect(linha(comCor, 'Pilha')).toBe(linha(semCor, 'Pilha'))
})

test('plano mostra a URL do preview que vai subir', () => {
  const p = buildPlan({
    card: card({ title: 'hero novo', repo: 'org/app' }),
    hasDevServer: true,
    previewUrl: 'http://localhost:5220',
  })
  const t = renderPlan(p)
  expect(t).toContain('Preview')
  expect(t).toContain('http://localhost:5220')
  expect(t).toContain('sobe quando executar')
})

test('plano distingue preview ja no ar', () => {
  const p = buildPlan({
    card: card({ title: 'hero', repo: 'org/app' }),
    hasDevServer: true,
    previewUrl: 'http://localhost:5220',
    previewAtivo: true,
  })
  expect(renderPlan(p)).toContain('no ar agora')
})

test('alvo sem dev server nao promete preview', () => {
  const p = buildPlan({ card: card({ title: 'x', repo: 'org/app' }), hasDevServer: false, previewUrl: 'http://x' })
  expect(renderPlan(p)).not.toContain('Preview')
})

test('com cor, a URL do preview vira link clicavel', () => {
  const p = buildPlan({ card: card({ title: 'x', repo: 'org/app' }), hasDevServer: true, previewUrl: 'http://localhost:5220' })
  expect(renderPlan(p, { color: true })).toContain('\x1b]8;;http://localhost:5220')
})
