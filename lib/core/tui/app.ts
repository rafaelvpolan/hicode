import { openScreen } from './screen'
import type { Terminal } from './screen'
import { newInput, keypress, aplicarCompletar, pararNavegacao } from './input'
import { tokenizeParcial, agruparColagem } from './keys'
import { linkificar } from './layout'
import type { InputState } from './input'

export interface CorpoContexto {
  navegando: boolean
  altura: number
}

export interface AppHooks {
  header: () => string
  corpo: (ctx: CorpoContexto) => string[]
  dica: (ctx: CorpoContexto) => string
  prompt: () => string
  rodape: () => string[]
  onLine: (linha: string) => Promise<void> | void
  onComplete: (linha: string) => string[]
  onInterrupt: () => boolean
  onNav: (dir: -1 | 1) => boolean
  onEntrar: () => void
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
    const rodape = hooks.rodape()
    const ctx: CorpoContexto = {
      navegando: input.navegando,
      altura: Math.max(4, term.rows() - 6 - rodape.length),
    }
    const corpo = hooks.corpo(ctx)
    screen.draw({
      header: hooks.header(),
      corpo: ctx.navegando ? corpo : [...corpo, ...extras],
      input: ctx.navegando ? '' : input.buffer,
      cursor: ctx.navegando ? 0 : input.cursor,
      dica: hooks.dica(ctx),
      prompt: hooks.prompt(),
      rodape,
    })
  }

  const log = (linha: string): void => {
    for (const l of linha.split('\n')) extras.push(linkificar(l))
    if (extras.length > 500) extras.splice(0, extras.length - 500)
    if (!emLote) desenhar()
  }

  const finalizar = (): void => {
    if (sair) return
    sair = true
    clearInterval(timer)
    term.offKey(onChunk)
    screen.close()
    resolver?.()
  }

  let pendente = ''
  let emLote = false

  const onChunk = (chunk: string): void => {
    if (sair) return
    const r = tokenizeParcial(chunk, pendente)
    pendente = r.pendente
    const tokens = agruparColagem(r.tokens)
    if (!tokens.length) return
    emLote = true
    let precisaDesenhar = false
    try {
      for (const token of tokens) {
        if (sair) return
        precisaDesenhar = onKey(token) || precisaDesenhar
      }
    } finally {
      emLote = false
    }
    if (precisaDesenhar && !sair) desenhar()
  }

  const onKey = (key: string): boolean => {
    if (sair) return false
    const exibido = input.buffer
    const r = keypress(input, key)
    input = r.state
    const a = r.action
    if (a.kind === 'submit') {
      if (a.line.trim() || a.line === '') {
        log(`${hooks.prompt()}${exibido}`)
        void Promise.resolve(hooks.onLine(a.line)).then(desenhar)
      }
      return true
    }
    if (a.kind === 'interrupt') {
      if (hooks.onInterrupt()) { finalizar(); return false }
      return true
    }
    if (a.kind === 'nav') {
      if (!hooks.onNav(a.dir)) input = pararNavegacao(input)
      return true
    }
    if (a.kind === 'entrar') {
      input = pararNavegacao(input)
      hooks.onEntrar()
      return true
    }
    if (a.kind === 'eof') { finalizar(); return false }
    if (a.kind === 'complete') {
      const opcoes = hooks.onComplete(a.line)
      if (opcoes.length === 1 && opcoes[0]) input = aplicarCompletar(input, opcoes[0])
      else if (opcoes.length > 1) log('  ' + opcoes.join('  '))
      return true
    }
    return a.kind === 'redraw'
  }

  const timer = setInterval(desenhar, hooks.intervalMs)

  return {
    log,
    run: () => new Promise<void>((resolve) => {
      resolver = resolve
      term.onKey(onChunk)
      desenhar()
    }),
  }
}
