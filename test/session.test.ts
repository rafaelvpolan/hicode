import { test, expect } from 'bun:test'
import { handle, newSession, planShown } from '../lib/core/session'
import { renderFleet } from '../lib/core/render/fleet'
import { isActive, waitsHuman, phaseLabel } from '../lib/core/render/phases'
import type { Fields } from '../lib/card'

const base = newSession('org/app')

test('texto livre cria tarefa', () => {
  const r = handle('FAQ acordeao na home', base)
  expect(r.effect.kind).toBe('submit')
  expect(r.effect.text).toBe('FAQ acordeao na home')
})

test('linha vazia sem plano pendente nao faz nada', () => {
  expect(handle('', base).effect.kind).toBe('none')
})

test('enter com plano pendente aprova e limpa o pendente', () => {
  const r = handle('', planShown(base, '042'))
  expect(r.effect.kind).toBe('approve-plan')
  expect(r.effect.id).toBe('042')
  expect(r.state.pendingPlan).toBe('')
})

test('texto livre com plano pendente descarta o plano e cria outro card', () => {
  const r = handle('outra tarefa', planShown(base, '042'))
  expect(r.effect.kind).toBe('submit')
  expect(r.state.pendingPlan).toBe('')
})

test('espaco em branco conta como enter, nao como tarefa', () => {
  expect(handle('   ', planShown(base, '042')).effect.kind).toBe('approve-plan')
})

test('/help, /board e /cards', () => {
  expect(handle('/help', base).effect.kind).toBe('help')
  expect(handle('/board', base).effect.kind).toBe('board')
  const c = handle('/cards HALTED', base)
  expect(c.effect.kind).toBe('cards')
  expect(c.effect.text).toBe('HALTED')
})

test('/watch e /plan exigem id', () => {
  expect(handle('/watch', base).effect.kind).toBe('error')
  expect(handle('/watch 42', base).effect.id).toBe('42')
  expect(handle('/plan', base).effect.kind).toBe('error')
})

test('/halt aceita motivo opcional e limpa plano pendente', () => {
  const r = handle('/halt 42 conflito com main', planShown(base, '042'))
  expect(r.effect.kind).toBe('halt')
  expect(r.effect.id).toBe('42')
  expect(r.effect.text).toBe('conflito com main')
  expect(r.state.pendingPlan).toBe('')
})

test('/halt sem motivo usa texto padrao', () => {
  expect(handle('/halt 42', base).effect.text).toBe('parado pelo humano')
})

test('/repo troca o alvo; sem argumento apenas informa', () => {
  expect(handle('/repo org/outro', base).state.repo).toBe('org/outro')
  const info = handle('/repo', base)
  expect(info.effect.kind).toBe('error')
  expect(info.effect.text).toContain('org/app')
})

test('/quit e aliases', () => {
  for (const c of ['/quit', '/exit', '/q']) expect(handle(c, base).effect.kind).toBe('quit')
})

test('comando desconhecido nao vira tarefa', () => {
  const r = handle('/naoexiste', base)
  expect(r.effect.kind).toBe('error')
  expect(r.effect.text).toContain('desconhecido')
})

test('comando nao aprova plano pendente por acidente', () => {
  expect(handle('/board', planShown(base, '042')).state.pendingPlan).toBe('042')
})

function card(over: Partial<Fields>): Fields {
  return { id: '1', title: 't', status: 'READY', ...over }
}

test('phases: classifica ativo, esperando humano e rotulo', () => {
  expect(isActive('EXECUTING')).toBe(true)
  expect(isActive('PREVIEW')).toBe(false)
  expect(waitsHuman('PREVIEW')).toBe(true)
  expect(waitsHuman('CLARIFY')).toBe(true)
  expect(phaseLabel('TESTS_GREEN')).toBe('Polir')
})

test('fleet: conta ativos e esperando separadamente', () => {
  const t = renderFleet([
    card({ id: '1', status: 'EXECUTING' }),
    card({ id: '2', status: 'PREVIEW' }),
    card({ id: '3', status: 'MERGED' }),
  ], { repo: 'org/app', daemon: 'online (pid 1)' })
  expect(t).toContain('1 ativo(s)')
  expect(t).toContain('1 esperando voce')
  expect(t).toContain('org/app')
})

test('fleet: card terminal nao aparece na faixa', () => {
  const t = renderFleet([card({ id: '9', status: 'MERGED' })], {})
  expect(t).not.toContain('#009')
})

test('fleet: HALTED e PAUSED aparecem com marca propria', () => {
  const t = renderFleet([card({ id: '4', status: 'HALTED' }), card({ id: '5', status: 'PAUSED' })], {})
  expect(t).toContain('parou')
  expect(t).toContain('pausado')
})

test('fleet sem cor nao emite escape ANSI', () => {
  const t = renderFleet([card({ id: '1', status: 'EXECUTING' })], { color: false })
  expect(t).not.toContain('\x1b[')
})

test('fleet vazio ainda mostra cabecalho e daemon', () => {
  const t = renderFleet([], { repo: 'org/app', daemon: 'offline' })
  expect(t).toContain('daemon offline')
  expect(t).toContain('0 ativo(s)')
})
