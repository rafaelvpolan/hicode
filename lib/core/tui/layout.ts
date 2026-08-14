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
  input: string
  corInput?: (linha: string) => string
  sugestoes?: string[]
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

export function posicaoNoTexto(texto: string, cursor: number): { linha: number; coluna: number } {
  const antes = texto.slice(0, Math.max(0, Math.min(cursor, texto.length)))
  const partes = antes.split('\n')
  return { linha: partes.length - 1, coluna: (partes[partes.length - 1] ?? '').length }
}

export function renderFrame(f: FrameInput): Frame {
  const largura = Math.max(24, f.cols)
  const interno = largura - 4
  const entrada = f.input.split('\n')
  const alturaEntrada = entrada.length
  const rodape = f.rodape ?? []
  const sugestoes = f.sugestoes ?? []
  const alturaCorpo = Math.max(MIN_CORPO, f.rows - 3 - alturaEntrada - rodape.length - sugestoes.length)
  const visiveis = f.corpo.slice(-alturaCorpo)
  const lines: string[] = []
  lines.push(padVisible('  ' + truncVisible(f.header, largura - 2), largura))
  lines.push('  ┌' + '─'.repeat(interno) + '┐')
  for (let i = 0; i < alturaCorpo; i++) {
    const conteudo = visiveis[i] ?? ''
    lines.push('  │' + padVisible(truncVisible(conteudo, interno), interno) + '│')
  }
  lines.push('  └' + '─'.repeat(interno) + '┘')
  for (const sg of sugestoes) lines.push(padVisible('  ' + truncVisible(sg, largura - 2), largura))
  const recuo = ' '.repeat(visibleLen(f.prompt))
  const primeira = lines.length + 1
  entrada.forEach((linha, i) => {
    const prefixo = i === 0 ? f.prompt : recuo
    const dica = i === entrada.length - 1 && f.dica
      ? padVisible('', Math.max(0, largura - 4 - visibleLen(prefixo) - visibleLen(linha) - visibleLen(f.dica))) + f.dica
      : ''
    const pintada = f.corInput ? f.corInput(linha) : linha
    lines.push(padVisible('  ' + prefixo + pintada + dica, largura))
  })
  for (const r of rodape) lines.push(padVisible('  ' + truncVisible(r, largura - 2), largura))
  const pos = posicaoNoTexto(f.input, f.cursor)
  return {
    lines,
    cursorRow: primeira + pos.linha,
    cursorCol: 3 + visibleLen(f.prompt) + pos.coluna,
  }
}
