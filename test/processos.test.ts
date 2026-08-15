import { test, expect } from 'bun:test'
import { renderProcessos, linhaDoTotal, duracao } from '../lib/core/render/processos'
import { visibleLen, stripAnsi } from '../lib/core/tui/layout'
import { corDoPasso } from '../lib/core/render/board'
import type { Passo } from '../lib/core/progresso'

const passos: Passo[] = [
  { label: 'Arquitetura', estado: 'feito' },
  { label: 'Testes', estado: 'feito' },
  { label: 'Seguranca', estado: 'pulado' },
  { label: 'Review', estado: 'agora' },
  { label: 'Limpeza', estado: 'pendente' },
]
const metricas = {
  Arquitetura: { time: 184, cost: 1.2, tokens: 40000 },
  Testes: { time: 96, cost: 0.51, tokens: 20000 },
}

test('cada passo mostra em que pe esta', () => {
  const t = renderProcessos(passos, { width: 74, metricas }).join('\n')
  expect(t).toContain('● Arquitetura')
  expect(t).toContain('◐ Review')
  expect(t).toContain('○ Limpeza')
  expect(t).toContain('· Seguranca')
})

test('passo concluido mostra quanto levou e quanto custou', () => {
  const t = renderProcessos(passos, { width: 74, metricas }).join('\n')
  expect(t).toContain('3min · US$1.20')
  expect(t).toContain('2min · US$0.51')
})

test('passo corrente mostra agente, ferramenta e ha quanto tempo', () => {
  const t = renderProcessos(passos, { width: 74, agente: 'crivo', ferramenta: 'Read App.vue', desde: '2min' }).join('\n')
  expect(t).toContain('crivo · Read App.vue · 2min')
  expect(t).toContain('←')
})

test('sem saber a ferramenta, ainda diz que esta trabalhando', () => {
  expect(renderProcessos(passos, { width: 74 }).join('\n')).toContain('trabalhando')
})

test('tarefa parada avisa que travou naquele passo', () => {
  const t = renderProcessos(passos, { width: 74, parado: true, agente: 'crivo' }).join('\n')
  expect(t).toContain('parado aqui')
  expect(t).not.toContain('crivo')
})

test('passo pulado explica o motivo', () => {
  expect(renderProcessos(passos, { width: 74 }).join('\n')).toContain('pulado neste perfil')
})

test('passo pendente nao inventa metrica', () => {
  const linha = renderProcessos(passos, { width: 74, metricas }).find(l => l.includes('Limpeza')) ?? ''
  expect(linha).not.toContain('US$')
  expect(linha).not.toContain('min')
})

test('passo sem metrica registrada nao mostra numero errado', () => {
  const so = [{ label: 'Review', estado: 'feito' } as Passo]
  expect(renderProcessos(so, { metricas }).join('')).not.toContain('US$')
})

test('bolinha e nome comecam sempre na mesma coluna', () => {
  const linhas = renderProcessos(passos, { width: 74, metricas }).map(stripAnsi)
  for (const l of linhas) {
    expect(l.slice(0, 2)).toBe('  ')
    expect(l[3]).toBe(' ')
  }
  const inicios = new Set(linhas.map(l => l.indexOf(l.trim().split(' ')[1] ?? '')))
  expect(inicios.size).toBe(1)
})

test('todos os nomes ocupam a mesma largura, entao a cauda alinha', () => {
  const linhas = renderProcessos(passos, { width: 74, metricas }).map(stripAnsi)
  const larguraDoNome = 'Arquitetura'.length
  for (const l of linhas) {
    expect(l.slice(4, 4 + larguraDoNome).length).toBe(larguraDoNome)
    expect(l.slice(4 + larguraDoNome, 6 + larguraDoNome)).toMatch(/^( ←|  )$/)
  }
})

test('cada passo mantem a cor que ja tem no board', () => {
  const t = renderProcessos([{ label: 'Testes', estado: 'feito' }], { color: true }).join('')
  expect(t).toContain(corDoPasso('Testes'))
})

test('cabe em qualquer largura', () => {
  for (const width of [30, 50, 78]) {
    for (const l of renderProcessos(passos, { width, metricas, agente: 'a'.repeat(50), ferramenta: 'f'.repeat(50) })) {
      expect(visibleLen(l)).toBeLessThanOrEqual(width)
    }
  }
})

test('sem cor nao emite escape ANSI', () => {
  expect(renderProcessos(passos, { color: false, metricas }).join('')).not.toContain('\x1b[')
})

test('lista vazia nao ocupa espaco', () => {
  expect(renderProcessos([])).toEqual([])
})

test('total conta passos feitos e tempo somado', () => {
  expect(linhaDoTotal(passos, { metricas })).toContain('2/5 passos')
  expect(linhaDoTotal(passos, { metricas })).toContain('5min')
})

test('duracao em s, min e h', () => {
  expect(duracao(30)).toBe('30s')
  expect(duracao(184)).toBe('3min')
  expect(duracao(7200)).toBe('2.0h')
  expect(duracao(0)).toBe('')
})
