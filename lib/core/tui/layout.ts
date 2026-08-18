const RESET = '\x1b[0m'
const CSI = /\x1b\[[0-9;?]*[A-Za-z]/g
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
const OSC_SPLIT = /(\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)[^\x1b]*\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))/

export function stripAnsi(s: string): string {
  return s.replace(OSC, '').replace(CSI, '')
}

const RE_URL = /https?:\/\/[^\s<>"')\]]+/g

export function suportaLink(env: Record<string, string | undefined> = process.env): boolean {
  const forcado = env.HICODE_HYPERLINKS
  if (forcado === 'on') return true
  if (forcado === 'off') return false
  if (env.WT_SESSION) return true
  if (env.KITTY_WINDOW_ID || env.GHOSTTY_RESOURCES_DIR) return true
  if (env.VTE_VERSION && Number(env.VTE_VERSION) >= 5000) return true
  const prog = env.TERM_PROGRAM ?? ''
  return ['iTerm.app', 'WezTerm', 'vscode', 'Hyper', 'Rio'].includes(prog)
}

export function link(url: string, texto = url): string {
  if (!suportaLink()) return texto
  return `\x1b]8;;${url}\x1b\\${texto}\x1b]8;;\x1b\\`
}

export function linkificar(texto: string): string {
  if (!suportaLink()) return texto
  const partes = texto.split(OSC_SPLIT)
  return partes
    .map((p, i) => (i % 2 === 1 ? p : p.replace(RE_URL, u => link(u))))
    .join('')
}

export function visibleLen(s: string): number {
  return stripAnsi(s).length
}

export function truncVisible(s: string, max: number): string {
  if (visibleLen(s) <= max) return s
  let visiveis = 0
  let out = ''
  let i = 0
  let temAnsi = false
  while (i < s.length && visiveis < max) {
    if (s[i] === '\x1b') {
      const m = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(s.slice(i)) ?? /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/.exec(s.slice(i))
      if (m?.[0]) {
        out += m[0]
        i += m[0].length
        temAnsi = true
        continue
      }
    }
    out += s[i]
    visiveis++
    i++
  }
  return (visiveis >= max ? out.slice(0, out.length - 1) + '…' : out) + (temAnsi ? RESET : '')
}

export function padVisible(s: string, largura: number): string {
  const falta = largura - visibleLen(s)
  return falta > 0 ? s + ' '.repeat(falta) : truncVisible(s, largura)
}

export interface FrameInput {
  rows: number
  cols: number
  header: string
  corpo: string[]
  fixo?: string[]
  input: string
  corInput?: (linha: string) => string
  sugestoes?: string[]
  legenda?: string
  cursor: number
  dica: string
  prompt: string
  rodape: string[]
}

export interface Frame {
  lines: string[]
  cursorRow: number
  cursorCol: number
}

const MIN_CORPO = 3
const MIN_ROLANTE = 5
const FATIA_PINADA = 0.4
const ALTURA_MINIMA = 4

export function posicaoNoTexto(texto: string, cursor: number): { linha: number; coluna: number } {
  const antes = texto.slice(0, Math.max(0, Math.min(cursor, texto.length)))
  const partes = antes.split('\n')
  return { linha: partes.length - 1, coluna: (partes[partes.length - 1] ?? '').length }
}

export function renderFrame(f: FrameInput): Frame {
  const largura = Math.max(24, f.cols)
  const interno = largura - 4
  const rodape = f.rodape ?? []
  const sugestoes = f.sugestoes ?? []
  const moldura = f.legenda !== undefined && f.rows >= ALTURA_MINIMA + 2 ? 2 : 0
  const linhaDica = f.dica && f.rows >= ALTURA_MINIMA + moldura + 1 ? 1 : 0
  const pos = posicaoNoTexto(f.input, f.cursor)
  const todasEntradas = f.input.split('\n')
  const maxEntrada = Math.max(1, f.rows - 3 - moldura - linhaDica - MIN_CORPO)
  const inicioEntrada = todasEntradas.length <= maxEntrada
    ? 0
    : Math.max(0, Math.min(pos.linha - maxEntrada + 1, todasEntradas.length - maxEntrada))
  const entrada = todasEntradas.slice(inicioEntrada, inicioEntrada + maxEntrada)
  const alturaEntrada = entrada.length
  const fixo = 3 + alturaEntrada + moldura + linhaDica
  const disponivel = Math.max(0, f.rows - fixo)
  const sugVisiveis = sugestoes.slice(0, Math.max(0, disponivel - 1))
  const rodapeVisivel = rodape.slice(0, Math.max(0, disponivel - sugVisiveis.length - MIN_CORPO))
  const alturaCorpo = Math.max(0, disponivel - sugVisiveis.length - rodapeVisivel.length)
  const pinado = f.fixo ?? []
  const tetoPinado = Math.max(1, Math.min(alturaCorpo - MIN_ROLANTE, Math.floor(alturaCorpo * FATIA_PINADA)))
  const quantosPinados = alturaCorpo ? Math.min(pinado.length, tetoPinado) : 0
  const pinadoVisivel = pinado.slice(0, quantosPinados)
  const alturaRolante = Math.max(0, alturaCorpo - quantosPinados)
  const rolantes = alturaRolante ? f.corpo.slice(-alturaRolante) : []
  const visiveis = [...pinadoVisivel, ...rolantes]
  const lines: string[] = []
  lines.push(padVisible('  ' + truncVisible(f.header, largura - 2), largura))
  lines.push('  ┌' + '─'.repeat(interno) + '┐')
  for (let i = 0; i < alturaCorpo; i++) {
    const conteudo = visiveis[i] ?? ''
    lines.push('  │' + padVisible(truncVisible(conteudo, interno), interno) + '│')
  }
  lines.push('  └' + '─'.repeat(interno) + '┘')
  for (const sg of sugVisiveis) lines.push(padVisible('  ' + truncVisible(sg, largura - 2), largura))
  const comMoldura = moldura === 2
  if (comMoldura) {
    const rotulo = f.legenda ? ` ${truncVisible(f.legenda, Math.max(4, interno - 4))} ` : ''
    const sobra = Math.max(0, interno - 1 - visibleLen(rotulo))
    lines.push('  ┌─' + rotulo + '─'.repeat(sobra) + '┐')
  }
  const recuo = ' '.repeat(visibleLen(f.prompt))
  const primeira = lines.length + 1
  const dentro = comMoldura ? interno - 2 : largura - 4
  entrada.forEach((linha, i) => {
    const prefixo = i === 0 ? f.prompt : recuo
    const pintada = f.corInput ? f.corInput(linha) : linha
    const conteudo = prefixo + pintada
    lines.push(comMoldura
      ? '  │ ' + padVisible(truncVisible(conteudo, interno - 2), interno - 2) + ' │'
      : padVisible('  ' + conteudo, largura))
  })
  if (comMoldura) lines.push('  └' + '─'.repeat(interno) + '┘')
  if (linhaDica) lines.push(padVisible('    ' + truncVisible(f.dica ?? '', largura - 4), largura))
  for (const r of rodapeVisivel) lines.push(padVisible('  ' + truncVisible(r, largura - 2), largura))
  return {
    lines,
    cursorRow: primeira + (pos.linha - inicioEntrada),
    cursorCol: (comMoldura ? 5 : 3) + visibleLen(f.prompt) + pos.coluna,
  }
}

export function quebrarEmLargura(texto: string, largura: number): string[] {
  const alvo = Math.max(20, largura)
  const saida: string[] = []
  for (const bruta of texto.split('\n')) {
    const linha = bruta.replace(/\s+$/, '')
    if (visibleLen(linha) <= alvo) { saida.push(linha); continue }
    const recuo = (linha.match(/^\s*/) ?? [''])[0]
    let atual = recuo
    for (const palavra of linha.trim().split(/\s+/)) {
      const candidata = atual.trim() ? `${atual} ${palavra}` : `${recuo}${palavra}`
      if (visibleLen(candidata) > alvo && atual.trim()) {
        saida.push(atual)
        atual = `${recuo}${palavra}`
      } else {
        atual = candidata
      }
    }
    if (atual.trim()) saida.push(atual)
  }
  return saida
}
