import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'

const ALT_ON = '\x1b[?1049h'
const ALT_OFF = '\x1b[?1049l'
const HOME = '\x1b[H'
const CLEAR_LINE = '\x1b[K'
const HIDE = '\x1b[?25l'
const SHOW = '\x1b[?25h'

export interface LiveOptions {
  dir: string
  intervalMs: number
  render: () => string
  write: (s: string) => void
}

export function paintFrame(texto: string, linhas: number): string {
  const corpo = texto.split('\n').map(l => l + CLEAR_LINE)
  while (corpo.length < linhas) corpo.push(CLEAR_LINE)
  return HOME + corpo.join('\n')
}

export interface LiveSession {
  stop: () => void
}

export function startLive(opts: LiveOptions, onStop: () => void): LiveSession {
  let parado = false
  opts.write(ALT_ON + HIDE)
  const desenhar = (): void => {
    if (parado) return
    const alt = Number(process.stdout.rows) || 40
    opts.write(paintFrame(opts.render(), alt - 1))
  }
  desenhar()
  const timer = setInterval(desenhar, opts.intervalMs)
  let observador: FSWatcher | null = null
  try {
    observador = watch(opts.dir, { persistent: false }, () => desenhar())
  } catch {
    observador = null
  }
  const stop = (): void => {
    if (parado) return
    parado = true
    clearInterval(timer)
    observador?.close()
    opts.write(SHOW + ALT_OFF)
    onStop()
  }
  return { stop }
}
