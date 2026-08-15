import { test, expect } from 'bun:test'
import { estadoDoPreview } from '../lib/core/preview-estado'
import type { EntradaPreview } from '../lib/core/preview-estado'

function e(over: Partial<EntradaPreview> = {}): EntradaPreview {
  return { status: 'READY', worktree: '', url: 'http://localhost:5222', vivo: false, temDevServer: true, ...over }
}

test('preview vivo mostra a URL e diz que esta no ar', () => {
  const r = estadoDoPreview(e({ vivo: true, status: 'PREVIEW', worktree: '/wt' }))
  expect(r.situacao).toBe('no-ar')
  expect(r.url).toBe('http://localhost:5222')
  expect(r.rotulo).toContain('no ar')
})

test('tarefa que ainda nao executou nao mostra URL morta', () => {
  for (const status of ['INBOX', 'READY', 'CLARIFY', 'SPECCED', 'PLAN_APPROVED', 'PAUSED']) {
    const r = estadoDoPreview(e({ status }))
    expect(r.situacao).toBe('futuro')
    expect(r.url).toBe('')
    expect(r.rotulo).toContain('quando a tarefa executar')
  }
})

test('tarefa entregue diz que o preview acabou, sem link morto', () => {
  for (const status of ['MERGED', 'DEPLOYED']) {
    const r = estadoDoPreview(e({ status, worktree: '/wt' }))
    expect(r.situacao).toBe('encerrado')
    expect(r.url).toBe('')
  }
})

test('tarefa com worktree e servidor caido oferece subir de novo', () => {
  const r = estadoDoPreview(e({ status: 'EXECUTED', worktree: '/wt' }))
  expect(r.situacao).toBe('parado')
  expect(r.url).toBe('http://localhost:5222')
  expect(r.comando).toBe('preview')
})

test('sem worktree, mesmo em estado avancado, nao promete preview', () => {
  const r = estadoDoPreview(e({ status: 'EXECUTED', worktree: '' }))
  expect(r.situacao).toBe('futuro')
  expect(r.url).toBe('')
})

test('projeto sem dev server nao fala de preview', () => {
  const r = estadoDoPreview(e({ temDevServer: false, vivo: true }))
  expect(r.situacao).toBe('sem-superficie')
  expect(r.url).toBe('')
})

test('vivo vence o estado do card — se responde, esta no ar', () => {
  expect(estadoDoPreview(e({ status: 'MERGED', vivo: true, worktree: '/wt' })).situacao).toBe('no-ar')
})

test('enquanto sobe, mostra a URL e avisa que esta subindo', () => {
  const r = estadoDoPreview(e({ status: 'EXECUTED', worktree: '/wt', subindo: true }))
  expect(r.situacao).toBe('subindo')
  expect(r.url).toBe('http://localhost:5222')
  expect(r.rotulo).toContain('subindo agora')
})

test('subindo nao vence servidor ja no ar', () => {
  expect(estadoDoPreview(e({ vivo: true, subindo: true, worktree: '/wt' })).situacao).toBe('no-ar')
})

test('subindo nao inventa link para tarefa sem worktree', () => {
  const r = estadoDoPreview(e({ status: 'CLARIFY', worktree: '', subindo: false }))
  expect(r.url).toBe('')
})
