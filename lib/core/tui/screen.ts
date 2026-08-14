import { renderFrame } from './layout'
import type { FrameInput } from './layout'

const ALT_ON = '\x1b[?1049h'
const ALT_OFF = '\x1b[?1049l'
const HOME = '\x1b[H'
const CLEAR_EOL = '\x1b[K'
const HIDE = '\x1b[?25l'
const SHOW = '\x1b[?25h'

export interface Terminal {
  write: (s: string) => void
  rows: () => number
  cols: () => number
  onResize: (fn: () => void) => void
  offResize: (fn: () => void) => void
  onKey: (fn: (k: string) => void) => void
  offKey: (fn: (k: string) => void) => void
  setRaw: (on: boolean) => void
}

export function nodeTerminal(): Terminal {
  const out = process.stdout
  const inp = process.stdin
  return {
    write: (s) => { out.write(s) },
    rows: () => Number(out.rows) || 24,
    cols: () => Number(out.columns) || 80,
    onResize: (fn) => { out.on('resize', fn) },
    offResize: (fn) => { out.off('resize', fn) },
    onKey: (fn) => { inp.on('data', (b: Buffer) => fn(b.toString())) },
    offKey: () => { inp.removeAllListeners('data') },
    setRaw: (on) => {
      inp.setRawMode?.(on)
      if (on) inp.resume()
      else inp.pause()
    },
  }
}

export function moveCursor(row: number, col: number): string {
  return `\x1b[${row};${col}H`
}

export function frameToAnsi(f: ReturnType<typeof renderFrame>): string {
  const corpo = f.lines.map(l => l + CLEAR_EOL).join('\n')
  return HOME + corpo + moveCursor(f.cursorRow, f.cursorCol)
}

export interface Screen {
  draw: (conteudo: Omit<FrameInput, 'rows' | 'cols'>) => void
  close: () => void
}

export function openScreen(term: Terminal): Screen {
  let aberto = true
  term.write(ALT_ON)
  term.setRaw(true)
  let ultimo: Omit<FrameInput, 'rows' | 'cols'> | null = null
  const draw = (conteudo: Omit<FrameInput, 'rows' | 'cols'>): void => {
    if (!aberto) return
    ultimo = conteudo
    term.write(HIDE)
    term.write(frameToAnsi(renderFrame({ ...conteudo, rows: term.rows(), cols: term.cols() })))
    term.write(SHOW)
  }
  const redesenhar = (): void => { if (ultimo) draw(ultimo) }
  term.onResize(redesenhar)
  return {
    draw,
    close: () => {
      if (!aberto) return
      aberto = false
      term.offResize(redesenhar)
      term.setRaw(false)
      term.write(SHOW + ALT_OFF)
    },
  }
}
