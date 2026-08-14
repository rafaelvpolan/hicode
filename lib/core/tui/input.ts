export interface InputState {
  buffer: string
  cursor: number
  history: string[]
  histIdx: number
  draft: string
}

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
  return { buffer: '', cursor: 0, history, histIdx: history.length, draft: '' }
}

const ENTER = ['\r', '\n']
const BACKSPACE = ['\x7f', '\b']
const UP = '\x1b[A'
const DOWN = '\x1b[B'
const RIGHT = '\x1b[C'
const LEFT = '\x1b[D'
const HOME = ['\x1b[H', '\x1b[1~', '\x01']
const END = ['\x1b[F', '\x1b[4~', '\x05']
const DELETE = '\x1b[3~'

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
  if (ENTER.includes(key)) {
    const line = state.buffer
    const history = line.trim() && state.history[state.history.length - 1] !== line
      ? [...state.history, line]
      : state.history
    return {
      state: { buffer: '', cursor: 0, history, histIdx: history.length, draft: '' },
      action: { kind: 'submit', line },
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
  if (key === '\x15') return { state: limpo(state, '', 0), action: { kind: 'redraw' } }
  if (key === '\x17') {
    const r = apagarPalavra(state.buffer, state.cursor)
    return { state: limpo(state, r.buffer, r.cursor), action: { kind: 'redraw' } }
  }
  if (key === LEFT) return { state: limpo(state, state.buffer, state.cursor - 1), action: { kind: 'redraw' } }
  if (key === RIGHT) return { state: limpo(state, state.buffer, state.cursor + 1), action: { kind: 'redraw' } }
  if (HOME.includes(key)) return { state: limpo(state, state.buffer, 0), action: { kind: 'redraw' } }
  if (END.includes(key)) return { state: limpo(state, state.buffer, state.buffer.length), action: { kind: 'redraw' } }
  if (key === UP) return navegarHistorico(state, -1)
  if (key === DOWN) return navegarHistorico(state, 1)
  if (imprimivel(key)) {
    const buffer = state.buffer.slice(0, state.cursor) + key + state.buffer.slice(state.cursor)
    return { state: limpo(state, buffer, state.cursor + 1), action: { kind: 'redraw' } }
  }
  return { state, action: { kind: 'none' } }
}

export function aplicarCompletar(state: InputState, sugestao: string): InputState {
  const partes = state.buffer.split(/\s+/)
  partes[partes.length - 1] = sugestao
  const buffer = partes.join(' ')
  return limpo(state, buffer, buffer.length)
}
