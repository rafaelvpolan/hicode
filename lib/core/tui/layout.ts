import { CANTO } from './paleta'
import { grafemasDe, larguraDeGrafema, larguraDeTexto } from './largura'

export { stripAnsi } from './largura'

const RESET = '\x1b[0m'
const ELIPSE = '…'
const OSC_SPLIT = /(\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)[^\x1b]*\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))/
const ESCAPE_SPLIT = /(\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))/

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
  return larguraDeTexto(s)
}

export function truncVisible(s: string, max: number): string {
  if (max <= 0) return ''
  if (visibleLen(s) <= max) return s
  const teto = max - larguraDeGrafema(ELIPSE)
  const partes = s.split(ESCAPE_SPLIT)
  let colunas = 0
  let out = ''
  let temAnsi = false
  for (let i = 0; i < partes.length; i++) {
    const parte = partes[i] ?? ''
    if (i % 2 === 1) {
      out += parte
      temAnsi = true
      continue
    }
    for (const grafema of grafemasDe(parte)) {
      const largura = larguraDeGrafema(grafema)
      if (colunas + largura > teto) return out + ELIPSE + (temAnsi ? RESET : '')
      out += grafema
      colunas += largura
    }
  }
  return out + ELIPSE + (temAnsi ? RESET : '')
}

export function padVisible(s: string, largura: number): string {
  const cortado = truncVisible(s, largura)
  const falta = largura - visibleLen(cortado)
  return falta > 0 ? cortado + ' '.repeat(falta) : cortado
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

function colunaVisualDoCursor(linha: string, codeUnitsAntes: number): number {
  return visibleLen(linha.slice(0, codeUnitsAntes))
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
  lines.push('  ' + CANTO.supEsq + '─'.repeat(interno) + CANTO.supDir)
  for (let i = 0; i < alturaCorpo; i++) {
    const conteudo = visiveis[i] ?? ''
    lines.push('  │' + padVisible(truncVisible(conteudo, interno), interno) + '│')
  }
  lines.push('  ' + CANTO.infEsq + '─'.repeat(interno) + CANTO.infDir)
  for (const sg of sugVisiveis) lines.push(padVisible('  ' + truncVisible(sg, largura - 2), largura))
  const comMoldura = moldura === 2
  if (comMoldura) {
    const rotulo = f.legenda ? ` ${truncVisible(f.legenda, Math.max(4, interno - 4))} ` : ''
    const sobra = Math.max(0, interno - 1 - visibleLen(rotulo))
    lines.push('  ' + CANTO.supEsq + '─' + rotulo + '─'.repeat(sobra) + CANTO.supDir)
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
  if (comMoldura) lines.push('  ' + CANTO.infEsq + '─'.repeat(interno) + CANTO.infDir)
  if (linhaDica) lines.push(padVisible('    ' + truncVisible(f.dica ?? '', largura - 4), largura))
  for (const r of rodapeVisivel) lines.push(padVisible('  ' + truncVisible(r, largura - 2), largura))
  return {
    lines,
    cursorRow: primeira + (pos.linha - inicioEntrada),
    cursorCol: (comMoldura ? 5 : 3) + visibleLen(f.prompt)
      + colunaVisualDoCursor(todasEntradas[pos.linha] ?? '', pos.coluna),
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
