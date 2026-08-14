import { test, expect } from 'bun:test'
import { newInput, keypress, aplicarCompletar } from '../lib/core/tui/input'
import type { InputState } from '../lib/core/tui/input'

function digitar(texto: string, inicial?: InputState): InputState {
  let s = inicial ?? newInput()
  for (const c of texto) s = keypress(s, c).state
  return s
}

test('digitar acumula no buffer e move o cursor', () => {
  const s = digitar('selo beta')
  expect(s.buffer).toBe('selo beta')
  expect(s.cursor).toBe(9)
})

test('enter submete e limpa o buffer', () => {
  const r = keypress(digitar('minha tarefa'), '\r')
  expect(r.action).toEqual({ kind: 'submit', line: 'minha tarefa' })
  expect(r.state.buffer).toBe('')
  expect(r.state.cursor).toBe(0)
})

test('enter guarda no historico, sem duplicar o ultimo', () => {
  let s = keypress(digitar('um'), '\r').state
  s = keypress(digitar('um', s), '\r').state
  expect(s.history).toEqual(['um'])
  s = keypress(digitar('dois', s), '\r').state
  expect(s.history).toEqual(['um', 'dois'])
})

test('enter em linha vazia nao entra no historico', () => {
  const s = keypress(newInput(), '\r').state
  expect(s.history).toEqual([])
})

test('backspace apaga antes do cursor e nao passa do zero', () => {
  let s = digitar('abc')
  s = keypress(s, '\x7f').state
  expect(s.buffer).toBe('ab')
  s = keypress(keypress(keypress(s, '\x7f').state, '\x7f').state, '\x7f').state
  expect(s.buffer).toBe('')
  expect(s.cursor).toBe(0)
})

test('setas movem o cursor sem sair dos limites', () => {
  let s = digitar('abc')
  s = keypress(s, '\x1b[D').state
  expect(s.cursor).toBe(2)
  s = keypress(keypress(keypress(keypress(s, '\x1b[D').state, '\x1b[D').state, '\x1b[D').state, '\x1b[D').state
  expect(s.cursor).toBe(0)
  for (let i = 0; i < 9; i++) s = keypress(s, '\x1b[C').state
  expect(s.cursor).toBe(3)
})

test('insere no meio da linha, nao no fim', () => {
  let s = digitar('ac')
  s = keypress(s, '\x1b[D').state
  s = keypress(s, 'b').state
  expect(s.buffer).toBe('abc')
  expect(s.cursor).toBe(2)
})

test('home e end (incluindo ctrl+a e ctrl+e)', () => {
  let s = digitar('abcdef')
  s = keypress(s, '\x01').state
  expect(s.cursor).toBe(0)
  s = keypress(s, '\x05').state
  expect(s.cursor).toBe(6)
  expect(keypress(s, '\x1b[H').state.cursor).toBe(0)
})

test('delete apaga a frente do cursor', () => {
  let s = digitar('abc')
  s = keypress(s, '\x01').state
  s = keypress(s, '\x1b[3~').state
  expect(s.buffer).toBe('bc')
})

test('ctrl+u limpa a linha', () => {
  const s = keypress(digitar('texto longo'), '\x15').state
  expect(s.buffer).toBe('')
})

test('ctrl+w apaga a palavra anterior', () => {
  let s = keypress(digitar('adicionar selo beta'), '\x17').state
  expect(s.buffer).toBe('adicionar selo ')
  s = keypress(s, '\x17').state
  expect(s.buffer).toBe('adicionar ')
})

test('ctrl+c interrompe sem apagar o buffer', () => {
  const s = digitar('meio digitado')
  const r = keypress(s, '\x03')
  expect(r.action.kind).toBe('interrupt')
  expect(r.state.buffer).toBe('meio digitado')
})

test('ctrl+d sai so quando a linha esta vazia', () => {
  expect(keypress(digitar('algo'), '\x04').action.kind).toBe('none')
  expect(keypress(newInput(), '\x04').action.kind).toBe('eof')
})

test('tab pede completar com a linha atual', () => {
  const r = keypress(digitar('/re'), '\t')
  expect(r.action).toEqual({ kind: 'complete', line: '/re' })
})

test('historico: cima e baixo navegam e voltam ao rascunho', () => {
  let s = keypress(digitar('primeira'), '\r').state
  s = keypress(digitar('segunda', s), '\r').state
  s = digitar('rascunho', s)
  s = keypress(s, '\x1b[A').state
  expect(s.buffer).toBe('segunda')
  s = keypress(s, '\x1b[A').state
  expect(s.buffer).toBe('primeira')
  s = keypress(s, '\x1b[A').state
  expect(s.buffer).toBe('primeira')
  s = keypress(keypress(s, '\x1b[B').state, '\x1b[B').state
  expect(s.buffer).toBe('rascunho')
})

test('historico vazio nao faz nada com as setas', () => {
  const s = digitar('abc')
  expect(keypress(s, '\x1b[A').state.buffer).toBe('abc')
})

test('escape solto e sequencia desconhecida nao sujam o buffer', () => {
  let s = digitar('limpo')
  for (const k of ['\x1b', '\x1b[Z', '\x00', '\x1b[200~']) s = keypress(s, k).state
  expect(s.buffer).toBe('limpo')
})

test('acento e emoji entram no buffer', () => {
  expect(digitar('ação').buffer).toBe('ação')
})

test('aplicarCompletar troca so a ultima palavra', () => {
  expect(aplicarCompletar(digitar('/repo acme/a'), 'acme/api').buffer).toBe('/repo acme/api')
  expect(aplicarCompletar(digitar('/re'), '/repo').buffer).toBe('/repo')
})
