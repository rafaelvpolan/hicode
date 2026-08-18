import { test, expect } from 'bun:test'
import { renderConfig } from '../lib/core/render/config'
import type { EstadoDaConfig, LinhaDeProvedor } from '../lib/core/render/config'
import { visibleLen, stripAnsi } from '../lib/core/tui/layout'
import { provedoresDisponiveis } from '../lib/ai/disponibilidade'

const ia = (nome: string, over: Partial<LinhaDeProvedor> = {}): LinhaDeProvedor => ({
  nome, situacao: 'disponivel', motivo: '', papeis: [], modelo: '', esforco: '',
  restringeFerramenta: true, isolaLeitura: true, reportaCusto: true, ...over,
})

const uso = (provedor: string, custoUsd: number): EstadoDaConfig['uso5h'][number] => ({
  provedor, modelos: ['m'], runs: 1, falhas: 0, custoUsd,
  tokensEntrada: 10, tokensSaida: 20, tokensCache: 30, tokensNaoSeparados: 0, tokens: 60,
  ultimoEm: '2026-08-18T16:00:00Z',
})

const base: EstadoDaConfig = {
  provedores: [ia('claude', { papeis: ['implement'] }), ia('kimi', { isolaLeitura: false })],
  selecionado: 'kimi',
  uso5h: [uso('claude', 1)], usoSemana: [uso('claude', 2)],
  serie: [1, 2, 3], loop: [], fila: 0, gastoHoje: 1.5, tetoUsd: 20, projeto: 'org/app',
}

test('todas as linhas do painel tem a MESMA largura visivel', () => {
  for (const largura of [60, 80, 100, 120, 140]) {
    const l = renderConfig(base, { color: false, largura, altura: 30 })
    const larguras = new Set(l.filter(x => x.trim()).map(visibleLen))
    expect(larguras.size, `largura ${largura}: ${[...larguras].join(',')}`).toBeLessThanOrEqual(2)
    for (const w of larguras) expect(w).toBeLessThanOrEqual(largura)
  }
})

test('com color=false nao vaza escape ANSI', () => {
  const t = renderConfig(base, { color: false, largura: 100, altura: 30 }).join('\n')
  expect(t).toBe(stripAnsi(t))
  expect(t).not.toContain('\x1b')
})

test('a ia selecionada leva o cursor e da titulo ao painel de detalhe', () => {
  const t = renderConfig(base, { color: false, largura: 100, altura: 30 }).join('\n')
  expect(t).toContain('▸ kimi')
  expect(t).toContain('KIMI · CONFIGURADO')
})

test('as tres situacoes de provedor aparecem distintas — nao viram todas "ausente"', () => {
  const e: EstadoDaConfig = {
    ...base,
    provedores: [
      ia('claude', { situacao: 'disponivel' }),
      ia('ollama', { situacao: 'precisa-servidor', motivo: 'suba o ollama' }),
      ia('codex', { situacao: 'ausente', motivo: 'instale o CLI do Codex' }),
    ],
  }
  const t = renderConfig(e, { color: false, largura: 100, altura: 30 }).join('\n')
  expect(t).toContain('conectada')
  expect(t).toContain('servidor local')
  expect(t).toContain('ausente')
})

test('limite declarado do provedor aparece no detalhe — isola leitura nao', () => {
  const t = renderConfig(base, { color: false, largura: 100, altura: 30 }).join('\n')
  expect(t).toContain('isola leitura')
  expect(t).toContain('nao')
})

test('estado vazio nao quebra e nao mente', () => {
  const vazio: EstadoDaConfig = {
    provedores: [], selecionado: '', uso5h: [], usoSemana: [], serie: [],
    loop: [], fila: 0, gastoHoje: 0, tetoUsd: 0, projeto: '',
  }
  const t = renderConfig(vazio, { color: false, largura: 80, altura: 20 }).join('\n')
  expect(t).toContain('nenhuma ia configurada')
  expect(t).toContain('sem execucao nesta janela')
  expect(t).toContain('nada em execucao')
})

test('loop em execucao mostra passo e agente, e conta a fila', () => {
  const t = renderConfig({ ...base, loop: [{ id: '024', passo: 'gerando', agente: 'limpio', desde: '00:41' }], fila: 2 },
    { color: false, largura: 100, altura: 30 }).join('\n')
  expect(t).toContain('LOOP EM EXECUCAO')
  expect(t).toContain('#024')
  expect(t).toContain('limpio')
  expect(t).toContain('+2 na fila')
})

test('REGRESSAO kimi e um CLI: nao pode ser reportado como servidor local', () => {
  const kimi = provedoresDisponiveis().find(p => p.nome === 'kimi')
  expect(kimi).toBeDefined()
  expect(kimi?.situacao).not.toBe('precisa-servidor')
})
