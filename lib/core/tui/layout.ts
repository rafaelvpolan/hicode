const RESET = '\x1b[0m'
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '')
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
      const m = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(s.slice(i))
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
  cursor: number
  dica: string
  prompt: string
}

export interface Frame {
  lines: string[]
  cursorRow: number
  cursorCol: number
}

const MIN_CORPO = 3

export function renderFrame(f: FrameInput): Frame {
  const largura = Math.max(24, f.cols)
  const interno = largura - 4
  const alturaCorpo = Math.max(MIN_CORPO, f.rows - 4)
  const visiveis = f.corpo.slice(-alturaCorpo)
  const lines: string[] = []
  lines.push(padVisible('  ' + truncVisible(f.header, largura - 2), largura))
  lines.push('  ┌' + '─'.repeat(interno) + '┐')
  for (let i = 0; i < alturaCorpo; i++) {
    const conteudo = visiveis[i] ?? ''
    lines.push('  │' + padVisible(truncVisible(conteudo, interno), interno) + '│')
  }
  lines.push('  └' + '─'.repeat(interno) + '┘')
  const dica = f.dica ? padVisible('', Math.max(0, largura - 4 - visibleLen(f.prompt) - visibleLen(f.input) - visibleLen(f.dica))) + f.dica : ''
  lines.push(padVisible('  ' + f.prompt + f.input + dica, largura))
  return {
    lines,
    cursorRow: lines.length,
    cursorCol: 3 + visibleLen(f.prompt) + Math.min(f.cursor, f.input.length),
  }
}
