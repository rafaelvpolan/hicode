import { test, expect } from 'bun:test'
import {
  LENTES, preflight, escolherLentes, promptDivergir, promptConvergir,
  parseIdeias, parseConvergencia, ordenar, pontuacao, comoOpcoes,
} from '../lib/core/ideate'

const base = { titulo: '', objetivo: '', perfil: 'padrao', override: '' }

test('preflight: pedido aberto de abordagem vale ideacao', () => {
  const r = preflight({ ...base, titulo: 'como estruturar a arquitetura do cache' })
  expect(r.vale).toBe(true)
})

test('REGRESSAO preflight: perfil micro e enxuto nunca ideiam', () => {
  for (const perfil of ['micro', 'enxuto']) {
    const r = preflight({ ...base, perfil, titulo: 'como melhorar a arquitetura' })
    expect(r.vale).toBe(false)
    expect(r.motivo).toContain(perfil)
  }
})

test('preflight: resposta canonica nao diverge', () => {
  for (const t of ['corrigir o typo do rodape', 'renomear a funcao', 'bump da versao']) {
    expect(preflight({ ...base, titulo: t }).vale).toBe(false)
  }
})

test('REGRESSAO preflight: pedido que ja pede o simples e respeitado', () => {
  const r = preflight({ ...base, titulo: 'como fazer isso rapido e simples' })
  expect(r.vale).toBe(false)
  expect(r.motivo).toContain('caminho simples')
})

test('preflight: pedido fechado nao vira ideacao', () => {
  expect(preflight({ ...base, titulo: 'adicionar um selo beta no hero' }).vale).toBe(false)
})

test('preflight: override do card manda nos dois sentidos', () => {
  expect(preflight({ ...base, titulo: 'typo', override: 'on' }).vale).toBe(true)
  expect(preflight({ ...base, titulo: 'como redesenhar tudo', override: 'off' }).vale).toBe(false)
})

test('escolherLentes devolve a quantidade pedida, sem repetir', () => {
  const l = escolherLentes(4, 'card-42')
  expect(l.length).toBe(4)
  expect(new Set(l.map(x => x.id)).size).toBe(4)
})

test('escolherLentes e estavel para a mesma semente e varia entre sementes', () => {
  expect(escolherLentes(4, 'a').map(l => l.id)).toEqual(escolherLentes(4, 'a').map(l => l.id))
  expect(escolherLentes(4, 'a').map(l => l.id)).not.toEqual(escolherLentes(4, 'zzz').map(l => l.id))
})

test('escolherLentes nao estoura o catalogo', () => {
  expect(escolherLentes(999, 'x').length).toBe(LENTES.length)
  expect(escolherLentes(0, 'x').length).toBe(1)
})

test('prompt de divergir proibe avaliar e traz a lente', () => {
  const p = promptDivergir(LENTES[0] as (typeof LENTES)[0], 'cachear o feed', 5)
  expect(p).toContain('NAO avalie')
  expect(p).toContain('cachear o feed')
  expect(p).toContain(String(LENTES[0]?.nome))
})

test('prompt do critico diz que ele nao gerou as ideias', () => {
  const p = promptConvergir('x', [{ lente: 'inversão', texto: 'ideia' }], 3)
  expect(p).toContain('Nao gerou nenhuma destas ideias')
  expect(p).toContain('ARMADILHAS')
})

test('parseIdeias extrai a lista e carimba a lente', () => {
  const r = parseIdeias('bla {"ideias":["uma","outra"]} bla', 'inversão')
  expect(r).toEqual([
    { lente: 'inversão', texto: 'uma' },
    { lente: 'inversão', texto: 'outra' },
  ])
})

test('parseIdeias devolve vazio em saida ilegivel, sem lancar', () => {
  expect(parseIdeias('sem json', 'x')).toEqual([])
  expect(parseIdeias('{"ideias":"nao e lista"}', 'x')).toEqual([])
  expect(parseIdeias('{"ideias":[null,"",  "boa"]}', 'x')).toEqual([{ lente: 'x', texto: 'boa' }])
})

const ideias = [
  { lente: 'inversão', texto: 'ideia um' },
  { lente: 'atacante', texto: 'ideia dois' },
  { lente: '3h', texto: 'ideia tres' },
]

test('parseConvergencia liga as notas de volta as ideias', () => {
  const c = parseConvergencia(JSON.stringify({
    shortlist: [{ n: 2, novidade: 9, viabilidade: 7, aderencia: 8 }],
    naoObvia: 2,
    armadilhas: [{ n: 1, porque: 'parece simples e nao escala' }],
    provocacao: 'e se o volume dobrar?',
  }), ideias)
  expect(c?.shortlist[0]?.texto).toBe('ideia dois')
  expect(c?.naoObvia?.texto).toBe('ideia dois')
  expect(c?.armadilhas[0]).toEqual({ ideia: 'ideia um', porque: 'parece simples e nao escala' })
  expect(c?.provocacao).toContain('volume dobrar')
})

test('parseConvergencia ignora indice fora da lista em vez de quebrar', () => {
  const c = parseConvergencia(JSON.stringify({ shortlist: [{ n: 99, novidade: 5 }] }), ideias)
  expect(c?.shortlist).toEqual([])
})

test('parseConvergencia limita nota a 0..10', () => {
  const c = parseConvergencia(JSON.stringify({ shortlist: [{ n: 1, novidade: 50, viabilidade: -3, aderencia: 7 }] }), ideias)
  expect(c?.shortlist[0]?.novidade).toBe(10)
  expect(c?.shortlist[0]?.viabilidade).toBe(0)
})

test('parseConvergencia devolve null em saida ilegivel', () => {
  expect(parseConvergencia('nada', ideias)).toBeNull()
})

test('pontuacao pesa viabilidade e aderencia acima de novidade', () => {
  const viavel = { lente: 'a', texto: 'x', novidade: 0, viabilidade: 10, aderencia: 10 }
  const novidadeira = { lente: 'b', texto: 'y', novidade: 10, viabilidade: 3, aderencia: 3 }
  expect(pontuacao(viavel)).toBeGreaterThan(pontuacao(novidadeira))
})

test('ordenar coloca a melhor primeiro sem mutar a lista', () => {
  const lista = [
    { lente: 'a', texto: 'fraca', novidade: 1, viabilidade: 1, aderencia: 1 },
    { lente: 'b', texto: 'forte', novidade: 8, viabilidade: 9, aderencia: 9 },
  ]
  expect(ordenar(lista)[0]?.texto).toBe('forte')
  expect(lista[0]?.texto).toBe('fraca')
})

test('comoOpcoes vira lista curta pronta para virar pergunta', () => {
  const c = {
    shortlist: [
      { lente: 'inversão', texto: 'primeira ideia', novidade: 9, viabilidade: 9, aderencia: 9 },
      { lente: '3h', texto: 'segunda ideia', novidade: 1, viabilidade: 1, aderencia: 1 },
    ],
    naoObvia: null, armadilhas: [], provocacao: '',
  }
  const ops = comoOpcoes(c, 2)
  expect(ops[0]).toContain('primeira ideia')
  expect(ops[0]).toContain('inversão')
  expect(ops.length).toBe(2)
})
