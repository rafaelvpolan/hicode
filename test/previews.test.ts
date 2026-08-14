import { test, expect } from 'bun:test'
import { inventario, orfaos, planejarPreview } from '../lib/core/previews'
import type { Fields } from '../lib/card/types'

function card(over: Partial<Fields>): Fields {
  return { id: '1', title: 't', status: 'READY', repo: 'org/app', ...over }
}

const base = 5200

test('inventario lista so as portas que respondem', () => {
  const cards = [card({ id: '20' }), card({ id: '28' })]
  const p = inventario({ cards, base, vivo: (u) => u.endsWith('5228') })
  expect(p.map(x => x.porta)).toEqual([5228])
})

test('preview de tarefa entregue conta como orfao', () => {
  const cards = [card({ id: '20', status: 'MERGED' }), card({ id: '28', status: 'PREVIEW' })]
  const p = inventario({ cards, base, vivo: () => true })
  expect(p.find(x => x.cardId === '20')?.situacao).toBe('orfao')
  expect(p.find(x => x.cardId === '28')?.situacao).toBe('em-uso')
  expect(orfaos(p).map(x => x.cardId)).toEqual(['20'])
})

test('usa a url gravada no card quando existe', () => {
  const p = inventario({
    cards: [card({ id: '9', preview_url: 'http://localhost:5999' })],
    base,
    vivo: () => true,
  })
  expect(p[0]?.porta).toBe(5999)
})

test('inventario sai ordenado por porta', () => {
  const cards = [card({ id: '30' }), card({ id: '10' }), card({ id: '20' })]
  expect(inventario({ cards, base, vivo: () => true }).map(x => x.porta)).toEqual([5210, 5220, 5230])
})

test('nada rodando devolve lista vazia, nao erro', () => {
  expect(inventario({ cards: [card({})], base, vivo: () => false })).toEqual([])
})

const g = (over = {}): Parameters<typeof planejarPreview>[0] => ({
  status: 'EXECUTED', worktree: '/wt', url: 'http://localhost:5222', vivo: false, temDevServer: true, ...over,
})

test('servidor no ar e reaproveitado, nao reiniciado', () => {
  const p = planejarPreview(g({ vivo: true }))
  expect(p.acao).toBe('reusar')
  expect(p.url).toBe('http://localhost:5222')
})

test('servidor caido com worktree manda subir', () => {
  expect(planejarPreview(g()).acao).toBe('subir')
})

test('sem worktree nao promete link', () => {
  const p = planejarPreview(g({ worktree: '' }))
  expect(p.acao).toBe('nada')
  expect(p.url).toBe('')
})

test('tarefa entregue nao sobe servidor de novo', () => {
  expect(planejarPreview(g({ status: 'MERGED' })).acao).toBe('nada')
})

test('mas se a entregue ainda responde, reaproveita em vez de negar', () => {
  expect(planejarPreview(g({ status: 'MERGED', vivo: true })).acao).toBe('reusar')
})

test('projeto sem dev server nunca sobe nada', () => {
  expect(planejarPreview(g({ temDevServer: false })).acao).toBe('nada')
})
