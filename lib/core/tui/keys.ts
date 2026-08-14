export const PASTE_ON = '\x1b[?2004h'
export const PASTE_OFF = '\x1b[?2004l'

const INICIO_COLA = '\x1b[200~'
const FIM_COLA = '\x1b[201~'
export const PREFIXO_COLA = '\x00paste:'

export function marcarCola(texto: string): string {
  return PREFIXO_COLA + texto
}

export function ehCola(token: string): boolean {
  return token.startsWith(PREFIXO_COLA)
}

export function textoDaCola(token: string): string {
  return token.slice(PREFIXO_COLA.length)
}

function fimDaSequencia(chunk: string, i: number): number {
  const proximo = chunk[i + 1]
  if (proximo === '[') {
    let j = i + 2
    while (j < chunk.length && /[0-9;?]/.test(chunk[j] ?? '')) j++
    return j < chunk.length ? j + 1 : chunk.length
  }
  if (proximo === 'O' && i + 2 < chunk.length) return i + 3
  return i + 1
}

export function tokenize(chunk: string): string[] {
  const out: string[] = []
  let i = 0
  let solto = ''
  const despejar = (): void => {
    if (!solto) return
    for (const c of solto) out.push(c)
    solto = ''
  }
  while (i < chunk.length) {
    if (chunk.startsWith(INICIO_COLA, i)) {
      despejar()
      const fim = chunk.indexOf(FIM_COLA, i)
      const corte = fim < 0 ? chunk.length : fim
      out.push(marcarCola(chunk.slice(i + INICIO_COLA.length, corte)))
      i = fim < 0 ? chunk.length : fim + FIM_COLA.length
      continue
    }
    if (chunk[i] === '\x1b') {
      despejar()
      const fim = fimDaSequencia(chunk, i)
      out.push(chunk.slice(i, fim))
      i = fim
      continue
    }
    solto += chunk[i]
    i++
  }
  despejar()
  return out
}

export function agruparColagem(tokens: string[]): string[] {
  const imprimiveis = tokens.filter(t => t.length === 1 && t.charCodeAt(0) >= 32)
  if (tokens.length > 4 && imprimiveis.length === tokens.length) {
    return [marcarCola(tokens.join(''))]
  }
  return tokens
}

export function limparColado(texto: string): string {
  return texto.replace(/\r\n?/g, '\n').replace(/\n+/g, ' ').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim()
}
