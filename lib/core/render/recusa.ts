import { truncVisible } from '../tui/layout'
import { TIPOS } from '../tipo-de-prompt'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'

export interface RecusaOptions {
  color: boolean
  width: number
}

const PADRAO: RecusaOptions = { color: false, width: 78 }

function paint(s: string, cor: string, o: RecusaOptions): string {
  return o.color ? `${cor}${s}${RESET}` : s
}

export function renderRecusa(texto: string, motivo: string, opts: Partial<RecusaOptions> = {}): string[] {
  const o = { ...PADRAO, ...opts }
  const pergunta = texto.replace(/\s+/g, ' ').trim()
  return [
    '',
    `  ${paint('?', CYAN, o)} ${paint('lido como pergunta', BOLD, o)}${paint(`  ${motivo}`, DIM, o)}`,
    `    ${paint(truncVisible(pergunta, o.width - 6), DIM, o)}`,
    '',
    `    ${paint('nao criei card', YELLOW, o)}${paint(` — ${TIPOS.ask}`, DIM, o)}`,
    `    ${paint('para virar tarefa, escreva o que mudar:', DIM, o)} ${paint('"remove o selo beta do header"', CYAN, o)}`,
    '',
  ].map(l => truncVisible(l, o.width))
}
