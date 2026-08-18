import { openScreen } from './screen'
import type { Terminal } from './screen'
import { newInput, keypress, aplicarCompletar, pararNavegacao, classificarNavegacao } from './input'
import type { ModoNavegacao } from './input'
import { tokenizeParcial, agruparColagem } from './keys'
import { linkificar, quebrarEmLargura } from './layout'
import type { InputState } from './input'

interface ErroLancado {
  message?: string
}

function mensagemDoErro(e: ErroLancado): string {
  return e?.message ? e.message : String(e)
}

export interface CorpoContexto {
  navegando: ModoNavegacao
  altura: number
  sugerindo: boolean
}

export interface AppHooks {
  header: () => string
  corpo: (ctx: CorpoContexto) => string[]
  fixo?: (ctx: CorpoContexto) => string[]
  dica: (ctx: CorpoContexto) => string
  prompt: () => string
  legenda?: () => string
  rodape: () => string[]
  onLine: (linha: string) => Promise<void> | void
  onComplete: (linha: string) => string[]
  sugestoes?: (opcoes: string[], selecionado: number) => string[]
  prefixoComum?: (opcoes: string[]) => string
  corInput?: (linha: string) => string
  onInterrupt: () => boolean
  onNav?: (dir: -1 | 1, modo: ModoNavegacao) => boolean
  onEntrar?: (modo: ModoNavegacao) => void
  onAba?: (dir: -1 | 1) => void
  onCiclarIa?: (dir: -1 | 1) => void
  podeLimpar?: () => string
  logPrimeiro?: (ctx: CorpoContexto) => boolean
  acima?: (ctx: CorpoContexto) => string[]
  intervalMs: number
}

export interface App {
  run: () => Promise<void>
  log: (linha: string) => void
  abrirBoard: () => void
  limparLog: () => void
}

const PADRAO = {
  fixo: (): string[] => [],
  legenda: (): string | undefined => undefined,
  sugestoes: (): string[] => [],
  prefixoComum: (): string => '',
  podeLimpar: (): string => '',
  logPrimeiro: (): boolean => false,
  acima: (): string[] => [],
  onNav: (): boolean => false,
  onEntrar: (): void => {},
  onAba: (): void => {},
  onCiclarIa: (): void => {},
}

export function createApp(term: Terminal, dados: AppHooks): App {
  const hooks = { ...PADRAO, ...dados }
  const extras: string[] = []
  let sugestoes: string[] = []
  let sugIdx = -1
  let sujo = true
  let quadro: { fixo: string[]; corpo: string[]; rodape: string[] } = { fixo: [], corpo: [], rodape: [] }
  let input: InputState = newInput()
  let sair = false
  let resolver: (() => void) | null = null
  const screen = openScreen(term)

  const desenhar = (): void => {
    const sugAnterior = sugestoes.join('\n')
    sugestoes = input.buffer.startsWith('/') && !input.buffer.includes('\n')
      ? hooks.onComplete(input.buffer)
      : []
    if (!sugestoes.length) sugIdx = -1
    if (sugestoes.join('\n') !== sugAnterior) sujo = true
    if (sujo) {
      const rodape = hooks.rodape()
      const ctx: CorpoContexto = {
        navegando: input.navegando,
        altura: Math.max(4, term.rows() - 6 - rodape.length - sugestoes.length),
        sugerindo: sugestoes.length > 0,
      }
      const fixo = hooks.fixo(ctx)
      const corpo = hooks.corpo(ctx)
      const interno = Math.max(20, term.cols() - 4)
      const rolante = ctx.navegando === 'board'
        ? corpo
        : (hooks.logPrimeiro(ctx) ? [...extras, ...corpo] : [...corpo, ...extras])
            .flatMap(l => quebrarEmLargura(l, interno))
      quadro = { fixo, corpo: rolante.slice(-Math.max(1, ctx.altura)), rodape }
      sujo = false
    }
    const rodape = quadro.rodape
    const ctx: CorpoContexto = {
      navegando: input.navegando,
      altura: Math.max(4, term.rows() - 6 - rodape.length - sugestoes.length),
      sugerindo: sugestoes.length > 0,
    }
    const acima = hooks.acima(ctx)
    screen.draw({
      header: hooks.header(),
      corpo: quadro.corpo,
      fixo: quadro.fixo,
      input: ctx.navegando === 'board' ? '' : input.buffer,
      cursor: ctx.navegando === 'board' ? 0 : input.cursor,
      dica: hooks.dica(ctx),
      prompt: hooks.prompt(),
      corInput: hooks.corInput,
      sugestoes: [...acima, ...hooks.sugestoes(sugestoes, sugIdx)],
      legenda: hooks.legenda(),
      rodape,
    })
  }

  const log = (linha: string): void => {
    for (const l of linha.split('\n')) extras.push(linkificar(l))
    if (extras.length > 500) extras.splice(0, extras.length - 500)
    sujo = true
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
  let fila: Promise<void> = Promise.resolve()

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
    if (sugestoes.length) {
      const nav = classificarNavegacao(key)
      if (nav === 'baixo') {
        sugIdx = (sugIdx + 1) % sugestoes.length
        return true
      }
      if (nav === 'cima') {
        sugIdx = sugIdx <= 0 ? sugestoes.length - 1 : sugIdx - 1
        return true
      }
      if (nav === 'enter' && sugIdx >= 0) {
        const escolha = sugestoes[sugIdx]
        if (escolha) input = aplicarCompletar(input, escolha)
        sugIdx = -1
        return true
      }
    }
    const exibido = input.buffer
    const r = keypress(input, key)
    input = r.state
    const a = r.action
    if (a.kind === 'submit') {
      if (a.line.trim() || a.line === '') {
        log(`${hooks.prompt()}${exibido}`)
        const linha = a.line
        fila = fila
          .then(() => hooks.onLine(linha))
          .catch((e: ErroLancado) => { log(`  erro: ${mensagemDoErro(e)}`) })
          .then(desenhar)
        void fila
      }
      return true
    }
    if (a.kind === 'interrupt') {
      if (hooks.onInterrupt()) { finalizar(); return false }
      return true
    }
    if (a.kind === 'nav') {
      sujo = true
      if (!hooks.onNav(a.dir, a.modo)) input = pararNavegacao(input)
      return true
    }
    if (a.kind === 'entrar') {
      const modo = a.modo
      input = pararNavegacao(input)
      sujo = true
      hooks.onEntrar(modo)
      return true
    }
    if (a.kind === 'ciclar-ia') {
      sujo = true
      hooks.onCiclarIa(a.dir)
      return true
    }
    if (a.kind === 'aba') {
      sujo = true
      hooks.onAba(a.dir)
      return true
    }
    if (a.kind === 'limpar') {
      sujo = true
      const motivo = hooks.podeLimpar()
      if (motivo) log(`  ${motivo}`)
      else extras.length = 0
      return true
    }
    if (a.kind === 'eof') { finalizar(); return false }
    if (a.kind === 'complete') {
      const opcoes = hooks.onComplete(a.line)
      if (!opcoes.length) return true
      if (opcoes.length === 1 && opcoes[0]) {
        input = aplicarCompletar(input, opcoes[0])
        sugIdx = -1
        return true
      }
      const comum = hooks.prefixoComum(opcoes)
      const atual = a.line.split(/\s+/).pop() ?? ''
      if (comum && comum.length > atual.length) {
        input = aplicarCompletar(input, comum)
        return true
      }
      sugIdx = (sugIdx + 1) % opcoes.length
      const escolha = opcoes[sugIdx]
      if (escolha) input = aplicarCompletar(input, escolha)
      return true
    }
    return a.kind === 'redraw'
  }

  const timer = setInterval(() => { sujo = true; desenhar() }, hooks.intervalMs)

  return {
    log,
    limparLog: (): void => {
      extras.length = 0
      sujo = true
      desenhar()
    },
    abrirBoard: (): void => {
      input = { ...input, navegando: 'board' }
      sujo = true
      if (!hooks.onNav(1, 'board')) input = pararNavegacao(input)
      desenhar()
    },
    run: () => new Promise<void>((resolve) => {
      resolver = resolve
      term.onKey(onChunk)
      desenhar()
    }),
  }
}
