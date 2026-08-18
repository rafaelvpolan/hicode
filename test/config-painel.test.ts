import { test, expect } from 'bun:test'
import { renderConfig } from '../lib/core/render/config'
import type { EstadoDaConfig, LinhaDeProvedor } from '../lib/core/render/config'
import { visibleLen, stripAnsi } from '../lib/core/tui/layout'
import { provedoresDisponiveis } from '../lib/ai/disponibilidade'

const ia = (nome: string, over: Partial<LinhaDeProvedor> = {}): LinhaDeProvedor => ({
  nome, situacao: 'disponivel', habilitado: true, motivo: '', papeis: [], modelo: '', esforco: '',
  plano: '', detalheDoPlano: '', janelas: [], idadeDoUsoHoras: -1, modelosDisponiveis: [],
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

test('a coluna de ias mostra instalada, ligada e plano de cada uma', () => {
  const e: EstadoDaConfig = {
    ...base,
    provedores: [
      ia('claude', { plano: 'Max 5x', habilitado: true }),
      ia('ollama', { plano: 'local, sem plano', habilitado: false }),
      ia('codex', { situacao: 'ausente', habilitado: false, plano: '' }),
    ],
  }
  const t = renderConfig(e, { color: false, largura: 104, altura: 34 }).join('\n')
  expect(t).toContain('Max 5x')
  expect(t).toContain('local, sem plano')
  expect(t).toContain(' on ')
  expect(t).toContain('off')
  expect(t).toContain('ausente')
})

test('uso do plano vira medidor, e dado velho e marcado como velho', () => {
  const comJanela = ia('claude', {
    plano: 'Max 5x',
    janelas: [{ rotulo: '5h', percentual: 1, resetaEm: '' }, { rotulo: '7d', percentual: 29, resetaEm: '' }],
    idadeDoUsoHoras: 64,
  })
  const t = renderConfig({ ...base, provedores: [comJanela], selecionado: 'claude' },
    { color: false, largura: 104, altura: 34 }).join('\n')
  expect(t).toContain('PLANO E USO')
  expect(t).toContain('29%')
  expect(t).toContain('VELHO')
})

test('dado recente NAO e marcado como velho', () => {
  const recente = ia('claude', {
    plano: 'Max 5x',
    janelas: [{ rotulo: '5h', percentual: 3, resetaEm: '' }],
    idadeDoUsoHoras: 0.5,
  })
  const t = renderConfig({ ...base, provedores: [recente], selecionado: 'claude' },
    { color: false, largura: 104, altura: 34 }).join('\n')
  expect(t).toContain('medido ha 30 min')
  expect(t).not.toContain('VELHO')
})

test('provedor que nao reporta janela diz isso, em vez de mostrar zero', () => {
  const semJanela = ia('kimi', { plano: 'gerenciado (oauth)', janelas: [] })
  const t = renderConfig({ ...base, provedores: [semJanela], selecionado: 'kimi' },
    { color: false, largura: 104, altura: 34 }).join('\n')
  expect(t).toContain('sem janela reportada')
})

test('plano nao descoberto e dito, nao chutado', () => {
  const sem = ia('codex', { plano: '', situacao: 'ausente' })
  const t = renderConfig({ ...base, provedores: [sem], selecionado: 'codex' },
    { color: false, largura: 104, altura: 34 }).join('\n')
  expect(t).toContain('plano nao descoberto')
})
