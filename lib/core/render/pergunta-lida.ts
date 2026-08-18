import { truncVisible } from '../tui/layout'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'

export interface RecusaOptions {
  color: boolean
  width: number
}

const PADRAO: RecusaOptions = { color: false, width: 78 }

function paint(s: string, cor: string, o: RecusaOptions): string {
  return o.color ? `${cor}${s}${RESET}` : s
}

export function renderPergunta(motivo: string, opts: Partial<RecusaOptions> = {}): string[] {
  const o = { ...PADRAO, ...opts }
  return [
    `  ${paint('?', CYAN, o)} ${paint('lido como pergunta', BOLD, o)}${paint(` — respondendo sem criar card (${motivo})`, DIM, o)}`,
    `  ${paint('se era tarefa, use /new-task', DIM, o)}`,
  ].map(l => truncVisible(l, o.width))
}
