import { openScreen } from './screen'
import type { Terminal } from './screen'
import { newInput, keypress, aplicarCompletar } from './input'
import type { InputState } from './input'

export interface AppHooks {
  header: () => string
  corpo: () => string[]
  dica: () => string
  prompt: () => string
  onLine: (linha: string) => Promise<void> | void
  onComplete: (linha: string) => string[]
  onInterrupt: () => boolean
  intervalMs: number
}

export interface App {
  run: () => Promise<void>
  log: (linha: string) => void
}

export function createApp(term: Terminal, hooks: AppHooks): App {
  const extras: string[] = []
  let input: InputState = newInput()
  let sair = false
  let resolver: (() => void) | null = null
  const screen = openScreen(term)

  const desenhar = (): void => {
    screen.draw({
      header: hooks.header(),
      corpo: [...hooks.corpo(), ...extras],
      input: input.buffer,
      cursor: input.cursor,
      dica: hooks.dica(),
      prompt: hooks.prompt(),
    })
  }

  const log = (linha: string): void => {
    for (const l of linha.split('\n')) extras.push(l)
    if (extras.length > 500) extras.splice(0, extras.length - 500)
    desenhar()
  }

  const finalizar = (): void => {
    if (sair) return
    sair = true
    clearInterval(timer)
    term.offKey(onKey)
    screen.close()
    resolver?.()
  }

  const onKey = (key: string): void => {
    if (sair) return
    const r = keypress(input, key)
    input = r.state
    const a = r.action
    if (a.kind === 'submit') {
      if (a.line.trim() || a.line === '') {
        log(`${hooks.prompt()}${a.line}`)
        void Promise.resolve(hooks.onLine(a.line)).then(desenhar)
      }
      desenhar()
      return
    }
    if (a.kind === 'interrupt') {
      if (hooks.onInterrupt()) finalizar()
      else desenhar()
      return
    }
    if (a.kind === 'eof') return finalizar()
    if (a.kind === 'complete') {
      const opcoes = hooks.onComplete(a.line)
      if (opcoes.length === 1 && opcoes[0]) input = aplicarCompletar(input, opcoes[0])
      else if (opcoes.length > 1) log('  ' + opcoes.join('  '))
      desenhar()
      return
    }
    if (a.kind === 'redraw') desenhar()
  }

  const timer = setInterval(desenhar, hooks.intervalMs)

  return {
    log,
    run: () => new Promise<void>((resolve) => {
      resolver = resolve
      term.onKey(onKey)
      desenhar()
    }),
  }
}
