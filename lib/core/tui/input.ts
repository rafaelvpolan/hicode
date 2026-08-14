import { ehCola, textoDaCola } from './keys'

export interface InputState {
  buffer: string
  cursor: number
  history: string[]
  histIdx: number
  draft: string
  pastes: string[]
}

export const LIMITE_COLA = Number(process.env.HICODE_PASTE_INLINE_MAX || 120)
const RE_MARCADOR = /\[colado #(\d+)[^\]]*\]/g

export type InputAction =
  | { kind: 'none' }
  | { kind: 'redraw' }
  | { kind: 'submit'; line: string }
  | { kind: 'interrupt' }
  | { kind: 'eof' }
  | { kind: 'complete'; line: string }

export interface KeyResult {
  state: InputState
  action: InputAction
}

export function newInput(history: string[] = []): InputState {
  return { buffer: '', cursor: 0, history, histIdx: history.length, draft: '', pastes: [] }
}

function inserirTexto(state: InputState, texto: string): InputState {
  const buffer = state.buffer.slice(0, state.cursor) + texto + state.buffer.slice(state.cursor)
  return limpo(state, buffer, state.cursor + texto.length)
}

export function colar(state: InputState, bruto: string): InputState {
  const texto = bruto.replace(/\r\n?/g, '\n')
  const linhas = texto.split('\n').length
  const inline = texto.length <= LIMITE_COLA && linhas === 1
  if (inline) return inserirTexto(state, texto.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ''))
  const pastes = [...state.pastes, texto]
  const medida = linhas > 1 ? `${linhas} linhas` : `${texto.length} chars`
  const marcador = `[colado #${pastes.length} · ${medida}]`
  return { ...inserirTexto(state, marcador), pastes }
}

export function expandir(state: InputState, linha: string): string {
  return linha.replace(RE_MARCADOR, (m, n: string) => state.pastes[Number(n) - 1] ?? m)
}

const ENTER = ['\r']
const BACKSPACE = ['\x7f']
const UP = '\x1b[A'
const DOWN = '\x1b[B'
const RIGHT = '\x1b[C'
const LEFT = '\x1b[D'
const HOME = ['\x1b[H', '\x1b[1~', '\x01']
const END = ['\x1b[F', '\x1b[4~', '\x05']
const DELETE = '\x1b[3~'
const PALAVRA_ESQ = ['\x1b[1;5D', '\x1b[5D', '\x1b[1;3D', '\x1bb', '\x1b[1;2D']
const PALAVRA_DIR = ['\x1b[1;5C', '\x1b[5C', '\x1b[1;3C', '\x1bf', '\x1b[1;2C']
const APAGA_PALAVRA_ESQ = ['\x17', '\x08', '\x1b\x7f', '\x1b[3;5~']
const APAGA_PALAVRA_DIR = ['\x1bd', '\x1b[3;3~']
const APAGA_ATE_FIM = '\x0b'
const APAGA_ATE_INICIO = '\x15'
const QUEBRA_LINHA = ['\n', '\x1b\r', '\x1b\n', '\x1b[13;2u', '\x1b[13;5u', '\x1b[13;2;13u', '\x1bOM']

function limpo(state: InputState, buffer: string, cursor: number): InputState {
  return { ...state, buffer, cursor: Math.max(0, Math.min(cursor, buffer.length)) }
}

function imprimivel(key: string): boolean {
  if (key.length !== 1) return false
  const c = key.charCodeAt(0)
  return c >= 32 && c !== 127
}

function apagarPalavra(buffer: string, cursor: number): { buffer: string; cursor: number } {
  const antes = buffer.slice(0, cursor)
  const cortado = antes.replace(/\S*\s*$/, '')
  return { buffer: cortado + buffer.slice(cursor), cursor: cortado.length }
}

export function inicioDaPalavra(buffer: string, cursor: number): number {
  const antes = buffer.slice(0, cursor)
  return antes.replace(/\S*\s*$/, '').length
}

export function fimDaPalavra(buffer: string, cursor: number): number {
  const depois = buffer.slice(cursor)
  const m = depois.match(/^\s*\S*/)
  return cursor + (m?.[0].length ?? 0)
}

function apagarPalavraFrente(buffer: string, cursor: number): string {
  return buffer.slice(0, cursor) + buffer.slice(fimDaPalavra(buffer, cursor))
}

function navegarHistorico(state: InputState, delta: number): KeyResult {
  if (!state.history.length) return { state, action: { kind: 'none' } }
  const draft = state.histIdx === state.history.length ? state.buffer : state.draft
  const idx = Math.max(0, Math.min(state.history.length, state.histIdx + delta))
  const buffer = idx === state.history.length ? draft : (state.history[idx] ?? '')
  return {
    state: { ...state, histIdx: idx, draft, buffer, cursor: buffer.length },
    action: { kind: 'redraw' },
  }
}

export function keypress(state: InputState, key: string): KeyResult {
  if (ENTER.includes(key) && state.buffer.endsWith('\\')) {
    const buffer = state.buffer.slice(0, -1) + '\n'
    return { state: limpo(state, buffer, buffer.length), action: { kind: 'redraw' } }
  }
  if (ENTER.includes(key)) {
    const line = state.buffer
    const history = line.trim() && state.history[state.history.length - 1] !== line
      ? [...state.history, line]
      : state.history
    return {
      state: { buffer: '', cursor: 0, history, histIdx: history.length, draft: '', pastes: [] },
      action: { kind: 'submit', line: expandir(state, line) },
    }
  }
  if (key === '\x03') return { state, action: { kind: 'interrupt' } }
  if (key === '\x04') {
    return state.buffer
      ? { state, action: { kind: 'none' } }
      : { state, action: { kind: 'eof' } }
  }
  if (key === '\t') return { state, action: { kind: 'complete', line: state.buffer } }
  if (BACKSPACE.includes(key)) {
    if (!state.cursor) return { state, action: { kind: 'none' } }
    const buffer = state.buffer.slice(0, state.cursor - 1) + state.buffer.slice(state.cursor)
    return { state: limpo(state, buffer, state.cursor - 1), action: { kind: 'redraw' } }
  }
  if (key === DELETE) {
    if (state.cursor >= state.buffer.length) return { state, action: { kind: 'none' } }
    const buffer = state.buffer.slice(0, state.cursor) + state.buffer.slice(state.cursor + 1)
    return { state: limpo(state, buffer, state.cursor), action: { kind: 'redraw' } }
  }
  if (key === APAGA_ATE_INICIO) {
    return { state: limpo(state, state.buffer.slice(state.cursor), 0), action: { kind: 'redraw' } }
  }
  if (key === APAGA_ATE_FIM) {
    return { state: limpo(state, state.buffer.slice(0, state.cursor), state.cursor), action: { kind: 'redraw' } }
  }
  if (APAGA_PALAVRA_ESQ.includes(key)) {
    const r = apagarPalavra(state.buffer, state.cursor)
    return { state: limpo(state, r.buffer, r.cursor), action: { kind: 'redraw' } }
  }
  if (APAGA_PALAVRA_DIR.includes(key)) {
    return { state: limpo(state, apagarPalavraFrente(state.buffer, state.cursor), state.cursor), action: { kind: 'redraw' } }
  }
  if (PALAVRA_ESQ.includes(key)) {
    return { state: limpo(state, state.buffer, inicioDaPalavra(state.buffer, state.cursor)), action: { kind: 'redraw' } }
  }
  if (PALAVRA_DIR.includes(key)) {
    return { state: limpo(state, state.buffer, fimDaPalavra(state.buffer, state.cursor)), action: { kind: 'redraw' } }
  }
  if (QUEBRA_LINHA.includes(key)) {
    return { state: inserirTexto(state, '\n'), action: { kind: 'redraw' } }
  }
  if (key === LEFT) return { state: limpo(state, state.buffer, state.cursor - 1), action: { kind: 'redraw' } }
  if (key === RIGHT) return { state: limpo(state, state.buffer, state.cursor + 1), action: { kind: 'redraw' } }
  if (HOME.includes(key)) return { state: limpo(state, state.buffer, 0), action: { kind: 'redraw' } }
  if (END.includes(key)) return { state: limpo(state, state.buffer, state.buffer.length), action: { kind: 'redraw' } }
  if (key === UP) return navegarHistorico(state, -1)
  if (key === DOWN) return navegarHistorico(state, 1)
  if (ehCola(key)) {
    return { state: colar(state, textoDaCola(key)), action: { kind: 'redraw' } }
  }
  if (imprimivel(key)) {
    const buffer = state.buffer.slice(0, state.cursor) + key + state.buffer.slice(state.cursor)
    return { state: limpo(state, buffer, state.cursor + 1), action: { kind: 'redraw' } }
  }
  if (key.length > 1 && [...key].every(c => c.charCodeAt(0) >= 32)) {
    return { state: colar(state, key), action: { kind: 'redraw' } }
  }
  return { state, action: { kind: 'none' } }
}

export function aplicarCompletar(state: InputState, sugestao: string): InputState {
  const partes = state.buffer.split(/\s+/)
  partes[partes.length - 1] = sugestao
  const buffer = partes.join(' ')
  return limpo(state, buffer, buffer.length)
}
