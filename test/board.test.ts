import { test, expect } from 'bun:test'
import { renderBoard, renderProjetos, resumirProjetos, idadeDe, legendaPassos } from '../lib/core/render/board'
import { passosDoCard, pulados } from '../lib/core/progresso'
import { DEFAULT_STEPS } from '../lib/runner/pipeline/config'
import type { Fields, StepMap } from '../lib/card'
import type { Passo } from '../lib/core/progresso'

function card(over: Partial<Fields>): Fields {
  return { id: '1', title: 'tarefa', status: 'READY', repo: 'org/app', ...over }
}

const semPassos = { passosDe: (): Passo[] => [] }

test('board so mostra os cards do repo escolhido', () => {
  const t = renderBoard([
    card({ id: '1', repo: 'org/app', title: 'do app' }),
    card({ id: '2', repo: 'org/outro', title: 'do outro' }),
  ], { repo: 'org/app', ...semPassos })
  expect(t).toContain('do app')
  expect(t).not.toContain('do outro')
})

test('board separa esperando voce, parados, rodando, fila e entregues', () => {
  const t = renderBoard([
    card({ id: '1', status: 'PREVIEW' }),
    card({ id: '2', status: 'HALTED' }),
    card({ id: '3', status: 'EXECUTING' }),
    card({ id: '4', status: 'READY' }),
    card({ id: '5', status: 'MERGED' }),
  ], { repo: 'org/app', ...semPassos })
  for (const g of ['esperando voce (1)', 'parados (1)', 'rodando (1)', 'na fila (1)', 'entregues (1)']) {
    expect(t).toContain(g)
  }
})

test('board soma o custo do projeto', () => {
  const t = renderBoard([
    card({ id: '1', cost_usd: '1.50' }),
    card({ id: '2', cost_usd: '2.25' }),
    card({ id: '3', repo: 'org/outro', cost_usd: '99.00' }),
  ], { repo: 'org/app', ...semPassos })
  expect(t).toContain('US$3.75')
})

test('board sem card convida a criar o primeiro', () => {
  expect(renderBoard([], { repo: 'org/app', ...semPassos })).toContain('nenhum card neste projeto')
})

test('board sem cor nao emite escape ANSI', () => {
  const t = renderBoard([card({ status: 'EXECUTING' })], { repo: 'org/app', color: false, ...semPassos })
  expect(t).not.toContain('\x1b[')
})

test('idade legivel em s, min, h e d', () => {
  const agora = Date.parse('2026-08-14T12:00:00Z')
  const em = (iso: string): string => idadeDe(iso, agora)
  expect(em('2026-08-14T11:59:30Z')).toBe('30s')
  expect(em('2026-08-14T11:30:00Z')).toBe('30min')
  expect(em('2026-08-14T09:00:00Z')).toBe('3h')
  expect(em('2026-08-12T12:00:00Z')).toBe('2d')
  expect(em('nao-e-data')).toBe('')
})

function steps(labels: string[]): StepMap {
  const m: StepMap = {}
  for (const l of labels) m[l] = { time: 5, cost: 0.1, tokens: 100 }
  return m
}

test('passos: registrado no run conta como feito', () => {
  const p = passosDoCard(card({ status: 'PREVIEW_OK' }), DEFAULT_STEPS, steps(['Arquitetura', 'Testes']))
  const porLabel = Object.fromEntries(p.map(x => [x.label, x.estado]))
  expect(porLabel.Arquitetura).toBe('feito')
  expect(porLabel.Testes).toBe('feito')
})

test('passos: o primeiro pendente durante o polimento e o "agora"', () => {
  const p = passosDoCard(card({ status: 'PREVIEW_OK' }), DEFAULT_STEPS, steps(['Arquitetura']))
  expect(p.find(x => x.estado === 'agora')?.label).toBe('Testes')
  expect(p.filter(x => x.estado === 'agora').length).toBe(1)
})

test('passos: card que ainda nao chegou ao polimento nao tem "agora"', () => {
  const p = passosDoCard(card({ status: 'EXECUTING' }), DEFAULT_STEPS, null)
  expect(p.every(x => x.estado === 'pendente')).toBe(true)
})

test('passos: estado adiantado marca os anteriores como feitos', () => {
  const p = passosDoCard(card({ status: 'PR_OPEN' }), DEFAULT_STEPS, null)
  expect(p.every(x => x.estado === 'feito')).toBe(true)
})

test('pulados lista o que o perfil deixou de fora', () => {
  const so = DEFAULT_STEPS.filter(s => s.id === 'limpeza')
  const fora = pulados(DEFAULT_STEPS, so).map(p => p.label)
  expect(fora).toContain('Testes')
  expect(fora).not.toContain('Limpeza')
})

test('legenda mostra o passo corrente, ou a contagem quando nao ha corrente', () => {
  expect(legendaPassos([{ label: 'Testes', estado: 'agora' }])).toBe('testes')
  expect(legendaPassos([{ label: 'A', estado: 'feito' }, { label: 'B', estado: 'pendente' }])).toBe('1/2')
  expect(legendaPassos([])).toBe('')
})

test('resumo de projetos conta esperando, rodando e parados por repo', () => {
  const r = resumirProjetos(
    [{ name: 'org/app', cloneOk: true }, { name: 'org/api', cloneOk: false }],
    [
      card({ id: '1', repo: 'org/app', status: 'PREVIEW' }),
      card({ id: '2', repo: 'org/app', status: 'EXECUTING' }),
      card({ id: '3', repo: 'org/app', status: 'HALTED', cost_usd: '2.00' }),
      card({ id: '4', repo: 'org/api', status: 'READY' }),
    ],
  )
  const app = r.find(p => p.name === 'org/app')
  expect(app).toMatchObject({ cards: 3, esperando: 1, rodando: 1, parados: 1, custo: '2.00' })
  expect(r.find(p => p.name === 'org/api')?.cloneOk).toBe(false)
})

test('lista de projetos numera e sinaliza clone ausente', () => {
  const t = renderProjetos(resumirProjetos([{ name: 'org/app', cloneOk: false }], []))
  expect(t).toContain('1  org/app')
  expect(t).toContain('clone ausente')
})

test('lista vazia orienta a registrar', () => {
  expect(renderProjetos([])).toContain('hii repo add')
})

import { renderPassos, renderLegenda, corDoPasso } from '../lib/core/render/board'

const opcoes = { color: true, repo: '', daemon: '', now: 0, width: 80, passosDe: (): Passo[] => [] }

test('cada passo tem cor propria, e a mesma sempre', () => {
  expect(corDoPasso('Arquitetura')).not.toBe(corDoPasso('Testes'))
  expect(corDoPasso('Testes')).toBe(corDoPasso('Testes'))
})

test('passo desconhecido ainda recebe cor da paleta', () => {
  expect(corDoPasso('Passo Novo', 0)).toBeTruthy()
})

test('bolinha vazia enquanto pendente, cheia quando feita', () => {
  const p: Passo[] = [{ label: 'Testes', estado: 'feito' }, { label: 'Review', estado: 'pendente' }]
  const t = renderPassos(p, opcoes)
  expect(t).toContain('●')
  expect(t).toContain('○')
})

test('passo corrente aparece meio-cheio', () => {
  expect(renderPassos([{ label: 'Testes', estado: 'agora' }], opcoes)).toContain('◐')
})

test('pendente sai sem cor propria; feito sai colorido', () => {
  const pendente = renderPassos([{ label: 'Testes', estado: 'pendente' }], opcoes)
  const feito = renderPassos([{ label: 'Testes', estado: 'feito' }], opcoes)
  expect(pendente).toContain('\x1b[2m')
  expect(feito).toContain(corDoPasso('Testes'))
})

test('legenda nomeia cada passo ao lado da sua bolinha', () => {
  const l = renderLegenda([
    { label: 'Arquitetura', estado: 'feito' },
    { label: 'Testes', estado: 'pendente' },
  ], opcoes)
  expect(l).toContain('arquitetura')
  expect(l).toContain('testes')
})

test('board mostra a legenda quando ha passos', () => {
  const t = renderBoard([card({ id: '1', status: 'PREVIEW_OK' })], {
    repo: 'org/app',
    passosDe: () => [{ label: 'Testes', estado: 'feito' }, { label: 'Review', estado: 'pendente' }],
  })
  expect(t).toContain('testes')
  expect(t).toContain('review')
})

test('board sem passos nao inventa legenda', () => {
  expect(renderBoard([card({ id: '1' })], { repo: 'org/app', ...semPassos })).not.toContain('legenda')
})

import { ordemDoBoard } from '../lib/core/render/board'

test('ordem do board e a mesma que aparece na tela', () => {
  const cards = [
    card({ id: '5', status: 'MERGED' }),
    card({ id: '3', status: 'EXECUTING' }),
    card({ id: '1', status: 'PREVIEW' }),
    card({ id: '4', status: 'READY' }),
    card({ id: '2', status: 'HALTED' }),
  ]
  expect(ordemDoBoard(cards, 'org/app')).toEqual(['1', '2', '3', '4', '5'])
})

test('ordem ignora cards de outro projeto', () => {
  const cards = [card({ id: '1' }), card({ id: '2', repo: 'org/outro' })]
  expect(ordemDoBoard(cards, 'org/app')).toEqual(['1'])
})

test('card selecionado ganha marca na linha', () => {
  const cards = [card({ id: '1', status: 'READY' }), card({ id: '2', status: 'READY' })]
  const t = renderBoard(cards, { repo: 'org/app', selecionado: '2', ...semPassos })
  const linhas = t.split('\n').filter(l => l.includes('#00'))
  expect(linhas.find(l => l.includes('#002'))?.startsWith('›')).toBe(true)
  expect(linhas.find(l => l.includes('#001'))?.startsWith('›')).toBe(false)
})

test('selecao nao muda a largura da linha', () => {
  const cards = [card({ id: '1', status: 'READY' })]
  const sem = renderBoard(cards, { repo: 'org/app', ...semPassos }).split('\n').find(l => l.includes('#001')) ?? ''
  const com = renderBoard(cards, { repo: 'org/app', selecionado: '1', ...semPassos }).split('\n').find(l => l.includes('#001')) ?? ''
  expect(com.length).toBe(sem.length)
})

import { linhasDoBoard, janela, renderBoardJanela } from '../lib/core/render/board'

function muitos(n: number): Fields[] {
  return Array.from({ length: n }, (_, i) => card({ id: String(i + 1), status: 'READY', title: `tarefa ${i + 1}` }))
}

test('cada linha de card sabe a qual card pertence', () => {
  const b = linhasDoBoard([card({ id: '7', status: 'READY' })], { repo: 'org/app', ...semPassos })
  const idx = b.idPorLinha.indexOf('7')
  expect(idx).toBeGreaterThan(0)
  expect(b.linhas[idx]).toContain('#007')
})

test('titulo de grupo e cabecalho nao apontam para card', () => {
  const b = linhasDoBoard([card({ id: '7', status: 'READY' })], { repo: 'org/app', ...semPassos })
  expect(b.idPorLinha.slice(0, b.cabecalho).every(x => x === '')).toBe(true)
})

test('janela respeita a altura pedida', () => {
  const b = linhasDoBoard(muitos(40), { repo: 'org/app', ...semPassos })
  expect(b.linhas.length).toBeGreaterThan(20)
  expect(janela(b, '1', 20).length).toBe(20)
})

test('janela mantem o cabecalho fixo enquanto rola', () => {
  const b = linhasDoBoard(muitos(40), { repo: 'org/app', ...semPassos })
  const j = janela(b, '38', 15)
  expect(j.slice(0, b.cabecalho)).toEqual(b.linhas.slice(0, b.cabecalho))
})

test('janela sempre mostra o card selecionado', () => {
  const b = linhasDoBoard(muitos(40), { repo: 'org/app', selecionado: '38', ...semPassos })
  for (const alvo of ['1', '20', '38', '40']) {
    const j = janela(linhasDoBoard(muitos(40), { repo: 'org/app', selecionado: alvo, ...semPassos }), alvo, 15)
    expect(j.some(l => l.includes(`#${alvo.padStart(3, '0')} `))).toBe(true)
  }
})

test('board curto nao e cortado', () => {
  const b = linhasDoBoard(muitos(2), { repo: 'org/app', ...semPassos })
  expect(janela(b, '1', 40)).toEqual(b.linhas)
})

test('altura zero significa sem limite', () => {
  const b = linhasDoBoard(muitos(40), { repo: 'org/app', ...semPassos })
  expect(janela(b, '1', 0)).toEqual(b.linhas)
})

test('renderBoard e renderBoardJanela sem limite dao o mesmo conteudo', () => {
  const cards = muitos(5)
  const o = { repo: 'org/app', ...semPassos }
  expect(renderBoardJanela(cards, o, 0).join('\n')).toBe(renderBoard(cards, o))
})
