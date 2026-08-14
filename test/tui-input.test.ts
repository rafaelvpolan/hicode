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

import { colar, expandir, LIMITE_COLA } from '../lib/core/tui/input'
import { tokenize, marcarCola, ehCola, textoDaCola, agruparColagem } from '../lib/core/tui/keys'

test('REGRESSAO colar texto curto entra inteiro no input', () => {
  const s = keypress(newInput(), marcarCola('https://github.com/org/repo/pull/18')).state
  expect(s.buffer).toBe('https://github.com/org/repo/pull/18')
})

test('REGRESSAO colar sem marcador de bracketed paste ainda funciona', () => {
  const r = keypress(newInput(), 'texto colado direto pelo terminal')
  expect(r.state.buffer).toContain('texto colado direto')
})

test('colagem longa vira marcador compacto e expande no envio', () => {
  const grande = 'linha\n'.repeat(40)
  const s = colar(newInput(), grande)
  expect(s.buffer).toMatch(/\[colado #1 · 41 linhas\]/)
  expect(s.buffer.length).toBeLessThan(40)
  expect(expandir(s, s.buffer)).toBe(grande.replace(/\r\n?/g, '\n'))
})

test('colagem de uma linha muito longa tambem compacta, medindo chars', () => {
  const s = colar(newInput(), 'x'.repeat(LIMITE_COLA + 50))
  expect(s.buffer).toContain('chars')
  expect(expandir(s, s.buffer).length).toBe(LIMITE_COLA + 50)
})

test('duas colagens viram marcadores distintos e ambas expandem', () => {
  let s = colar(newInput(), 'a\nb\nc\nd')
  s = colar(s, 'e\nf\ng\nh')
  expect(s.buffer).toContain('#1')
  expect(s.buffer).toContain('#2')
  const cheio = expandir(s, s.buffer)
  expect(cheio).toContain('a\nb\nc\nd')
  expect(cheio).toContain('e\nf\ng\nh')
})

test('enter entrega o texto EXPANDIDO', () => {
  const s = colar(newInput(), 'muitas\nlinhas\naqui\nmesmo')
  const r = keypress(s, '\r')
  expect(r.action.kind).toBe('submit')
  expect(r.action.kind === 'submit' && r.action.line).toContain('muitas\nlinhas')
})

test('tokenize separa sequencia de escape de caractere solto', () => {
  expect(tokenize('ab\x1b[Acd')).toEqual(['a', 'b', '\x1b[A', 'c', 'd'])
})

test('tokenize extrai a colagem entre os marcadores do terminal', () => {
  const t = tokenize('\x1b[200~texto colado\x1b[201~')
  expect(t.length).toBe(1)
  expect(ehCola(t[0] ?? '')).toBe(true)
  expect(textoDaCola(t[0] ?? '')).toBe('texto colado')
})

test('tokenize aguenta colagem sem o marcador de fim', () => {
  const t = tokenize('\x1b[200~sem fim')
  expect(textoDaCola(t[0] ?? '')).toBe('sem fim')
})

test('tokenize preserva emoji e acento como um token cada', () => {
  expect(tokenize('áé')).toEqual(['á', 'é'])
})

test('agruparColagem junta rajada de imprimiveis, mas nao digitacao curta', () => {
  expect(agruparColagem(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  const rajada = [...'texto colado sem bracketed paste']
  expect(agruparColagem(rajada).length).toBe(1)
})

test('agruparColagem nao junta quando ha tecla de controle no meio', () => {
  expect(agruparColagem(['a', 'b', 'c', 'd', 'e', '\x1b[A']).length).toBe(6)
})

import { tokenizeParcial } from '../lib/core/tui/keys'

test('REGRESSAO colagem partida em chunks nao vira duas colagens', () => {
  const a = tokenizeParcial('\x1b[200~primeira parte ')
  expect(a.tokens).toEqual([])
  expect(a.pendente).toContain('primeira parte')
  const b = tokenizeParcial('segunda parte\x1b[201~', a.pendente)
  expect(b.pendente).toBe('')
  expect(b.tokens.length).toBe(1)
  expect(textoDaCola(b.tokens[0] ?? '')).toBe('primeira parte segunda parte')
})

test('chunk normal nao deixa pendencia', () => {
  const r = tokenizeParcial('abc')
  expect(r.pendente).toBe('')
  expect(r.tokens).toEqual(['a', 'b', 'c'])
})

test('colagem completa num chunk so nao fica pendente', () => {
  const r = tokenizeParcial('\x1b[200~tudo junto\x1b[201~')
  expect(r.pendente).toBe('')
  expect(textoDaCola(r.tokens[0] ?? '')).toBe('tudo junto')
})

import { inicioDaPalavra, fimDaPalavra } from '../lib/core/tui/input'

test('ctrl+seta move por palavra', () => {
  let s = digitar('adicionar selo beta')
  s = keypress(s, '\x1b[1;5D').state
  expect(s.cursor).toBe(15)
  s = keypress(s, '\x1b[1;5D').state
  expect(s.cursor).toBe(10)
  s = keypress(s, '\x1b[1;5C').state
  expect(s.cursor).toBe(14)
})

test('alt+seta e emacs (esc+b / esc+f) tambem movem por palavra', () => {
  const s = digitar('um dois tres')
  expect(keypress(s, '\x1bb').state.cursor).toBe(8)
  expect(keypress(keypress(s, '\x01').state, '\x1bf').state.cursor).toBe(2)
})

test('ctrl+backspace e alt+backspace apagam a palavra anterior', () => {
  for (const k of ['\x08', '\x1b\x7f', '\x1b[3;5~']) {
    expect(keypress(digitar('selo beta agora'), k).state.buffer).toBe('selo beta ')
  }
})

test('alt+d apaga a palavra a frente', () => {
  let s = digitar('selo beta agora')
  s = keypress(s, '\x01').state
  expect(keypress(s, '\x1bd').state.buffer).toBe(' beta agora')
})

test('ctrl+k apaga ate o fim, ctrl+u ate o inicio', () => {
  let s = digitar('inicio meio fim')
  s = keypress(s, '\x1b[1;5D').state
  expect(keypress(s, '\x0b').state.buffer).toBe('inicio meio ')
  expect(keypress(s, '\x15').state.buffer).toBe('fim')
})

test('inicioDaPalavra e fimDaPalavra nao saem dos limites', () => {
  expect(inicioDaPalavra('abc', 0)).toBe(0)
  expect(fimDaPalavra('abc', 3)).toBe(3)
})

test('alt+enter e shift+enter (kitty) quebram linha em vez de enviar', () => {
  for (const k of ['\x1b\r', '\x1b[13;2u']) {
    const r = keypress(digitar('primeira'), k)
    expect(r.action.kind).toBe('redraw')
    expect(r.state.buffer).toBe('primeira\n')
  }
})

test('barra invertida no fim + enter tambem quebra linha', () => {
  const r = keypress(digitar('primeira\\'), '\r')
  expect(r.action.kind).toBe('redraw')
  expect(r.state.buffer).toBe('primeira\n')
})

test('enter normal depois da quebra envia as duas linhas', () => {
  let s = keypress(digitar('linha um'), '\x1b\r').state
  s = digitar('linha dois', s)
  const r = keypress(s, '\r')
  expect(r.action.kind).toBe('submit')
  expect(r.action.kind === 'submit' && r.action.line).toBe('linha um\nlinha dois')
})

test('REGRESSAO \\x7f e backspace simples; \\x08 e ctrl+backspace (apaga palavra)', () => {
  expect(keypress(digitar('abc'), '\x7f').state.buffer).toBe('ab')
  expect(keypress(digitar('selo beta'), '\x08').state.buffer).toBe('selo ')
})

test('ctrl+j quebra a linha em qualquer terminal', () => {
  const r = keypress(digitar('ab'), '\n')
  expect(r.action.kind).toBe('redraw')
  expect(r.state.buffer).toBe('ab\n')
})

test('enter continua sendo \\r e submete', () => {
  expect(keypress(digitar('ab'), '\r').action.kind).toBe('submit')
})

test('shift+enter do protocolo estendido quebra a linha', () => {
  for (const seq of ['\x1b[13;2u', '\x1b\r', '\x1b[13;2;13u']) {
    expect(keypress(digitar('ab'), seq).state.buffer).toBe('ab\n')
  }
})

test('REGRESSAO \\r\\n do terminal conta como UM enter, nao enter + quebra', () => {
  expect(tokenize('\r\n')).toEqual(['\r'])
  expect(tokenize('oi\r\n')).toEqual(['o', 'i', '\r'])
})

test('colagem multilinha nao vira submit por causa do \\n', () => {
  const tokens = tokenize('\x1b[200~um\ndois\x1b[201~')
  expect(tokens.length).toBe(1)
  expect(ehCola(tokens[0] ?? '')).toBe(true)
})

import { pararNavegacao } from '../lib/core/tui/input'

test('seta para baixo com campo vazio entra em selecao', () => {
  const r = keypress(newInput(), '\x1b[B')
  expect(r.action.kind).toBe('nav')
  expect(r.state.navegando).toBe(true)
})

test('seta para cima com campo vazio ainda recupera historico', () => {
  const r = keypress(newInput(['tarefa antiga']), '\x1b[A')
  expect(r.action.kind).toBe('redraw')
  expect(r.state.buffer).toBe('tarefa antiga')
  expect(r.state.navegando).toBe(false)
})

test('com texto digitado, seta para baixo continua sendo historico', () => {
  const s = digitar('meio escrito')
  expect(keypress(s, '\x1b[B').state.navegando).toBe(false)
})

test('navegando, as setas movem a selecao e enter entra', () => {
  const nav = keypress(newInput(), '\x1b[B').state
  expect(keypress(nav, '\x1b[A').action.kind).toBe('nav')
  expect(keypress(nav, '\x1b[B').action.kind).toBe('nav')
  expect(keypress(nav, '\r').action.kind).toBe('entrar')
})

test('esc sai da selecao', () => {
  const nav = keypress(newInput(), '\x1b[B').state
  expect(keypress(nav, '\x1b').state.navegando).toBe(false)
})

test('digitar sai da selecao e escreve a letra', () => {
  const nav = keypress(newInput(), '\x1b[B').state
  const r = keypress(nav, 'a')
  expect(r.state.navegando).toBe(false)
  expect(r.state.buffer).toBe('a')
})

test('pararNavegacao limpa o modo sem tocar no buffer', () => {
  const nav = { ...digitar('x'), navegando: true }
  const s = pararNavegacao(nav)
  expect(s.navegando).toBe(false)
  expect(s.buffer).toBe('x')
})

test('ctrl+c continua interrompendo mesmo se o terminal reencodar', () => {
  for (const k of ['\x03', '\x1b[99;5u', '\x1b[27;5;99~']) {
    expect(keypress(newInput(), k).action.kind).toBe('interrupt')
  }
})

test('shift+enter no formato modifyOtherKeys quebra a linha', () => {
  expect(keypress(digitar('ab'), '\x1b[27;2;13~').state.buffer).toBe('ab\n')
})

test('enter reencodado ainda submete, nao vira texto', () => {
  for (const k of ['\r', '\x1b[13u', '\x1b[27;1;13~']) {
    expect(keypress(digitar('ab'), k).action.kind).toBe('submit')
  }
})

test('tokenizer nao parte as sequencias novas ao meio', () => {
  expect(tokenize('\x1b[27;2;13~')).toEqual(['\x1b[27;2;13~'])
  expect(tokenize('\x1b[13u')).toEqual(['\x1b[13u'])
  expect(tokenize('\x1b[99;5u')).toEqual(['\x1b[99;5u'])
})
