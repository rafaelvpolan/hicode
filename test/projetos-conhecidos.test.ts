import { test, expect } from 'bun:test'
import { projetosConhecidos } from '../lib/core/projetos-conhecidos'
import type { Fields } from '../lib/card/types'

function card(repo: string): Fields {
  return { id: '1', title: 't', status: 'READY', repo }
}

test('com registro, lista o registro', () => {
  const r = projetosConhecidos([{ name: 'org/site' }], [card('org/site')])
  expect(r).toEqual([{ name: 'org/site', registrado: true }])
})

test('REGRESSAO registro vazio nao cega o motor — os cards revelam o projeto', () => {
  const r = projetosConhecidos([], [card('org/site'), card('org/site'), card('org/api')])
  expect(r.map(p => p.name)).toEqual(['org/api', 'org/site'])
  expect(r.every(p => !p.registrado)).toBe(true)
})

test('projeto so nos cards e marcado como fora do registro', () => {
  const r = projetosConhecidos([{ name: 'org/site' }], [card('org/site'), card('org/legado')])
  expect(r.find(p => p.name === 'org/site')?.registrado).toBe(true)
  expect(r.find(p => p.name === 'org/legado')?.registrado).toBe(false)
})

test('nao duplica projeto que esta nos dois lugares', () => {
  const r = projetosConhecidos([{ name: 'org/site' }], [card('org/site')])
  expect(r.length).toBe(1)
})

test('card sem repo nao vira projeto fantasma', () => {
  expect(projetosConhecidos([], [card(''), { id: '2', title: 't', status: 'READY' }])).toEqual([])
})

test('o registro vem primeiro, os orfaos depois em ordem', () => {
  const r = projetosConhecidos([{ name: 'z/registrado' }], [card('a/orfao'), card('b/orfao')])
  expect(r.map(p => p.name)).toEqual(['z/registrado', 'a/orfao', 'b/orfao'])
})
