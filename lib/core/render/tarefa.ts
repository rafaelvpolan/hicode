import { truncVisible, padVisible } from '../tui/layout'
import { floorProviders, formatProviders } from '../../runner/cost-gap'
import type { Card } from '../../card'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'

export interface TarefaOptions {
  color: boolean
  width: number
  subs: string[]
  objetivo: string
}

const PADRAO: TarefaOptions = { color: false, width: 78, subs: [], objetivo: '' }

function paint(s: string, cor: string, o: TarefaOptions): string {
  return o.color ? `${cor}${s}${RESET}` : s
}

function campo(rotulo: string, valor: string, o: TarefaOptions): string {
  return `  ${paint(padVisible(rotulo, 9), DIM, o)}${truncVisible(valor, o.width - 12)}`
}

export function renderCabecalhoTarefa(card: Card, opts: Partial<TarefaOptions> = {}): string[] {
  const o = { ...PADRAO, ...opts }
  const fm = card.fm
  const id = String(fm.id ?? '')
  const status = String(fm.status ?? 'INBOX')
  const out: string[] = []
  out.push(`  ${paint(`#${id}`, BOLD, o)} ${paint(status.toLowerCase(), CYAN, o)}  ${truncVisible(String(fm.title ?? ''), o.width - 20)}`)
  out.push(paint(`  ${'─'.repeat(Math.max(10, o.width - 4))}`, DIM, o))
  if (o.objetivo) out.push(campo('prompt', o.objetivo, o))
  const total = o.subs.length
  const mostrar = total > 3 ? o.subs.slice(-3) : o.subs
  const base = total - mostrar.length
  if (base > 0) out.push(campo('depois', paint(`(${base} instrucao(oes) anterior(es))`, DIM, o), o))
  mostrar.forEach((s, i) => out.push(campo(base === 0 && i === 0 ? 'depois' : '', `${base + i + 1}. ${s}`, o)))

  const url = String(fm.preview_url ?? '')
  if (url) out.push(campo('preview', url, o))

  const custo = parseFloat(String(fm.cost_usd ?? '0')) || 0
  const tokens = Number(fm.tokens_total ?? 0)
  const piso = formatProviders(floorProviders(fm))
  const gasto = [custo || piso ? `${piso ? '≥ ' : ''}US$${custo.toFixed(2)}` : '', tokens ? `${Math.round(tokens / 1000)}k tokens` : ''].filter(Boolean)
  if (gasto.length) out.push(campo('gasto', paint(gasto.join(' · '), DIM, o), o))
  if (piso) out.push(campo('', paint(`piso: ${piso} sem reporte de gasto`, YELLOW, o), o))

  out.push('')
  out.push(`  ${paint('escreva para mandar mais instrucoes nesta tarefa', YELLOW, o)}${paint('  ·  /board volta', DIM, o)}`)
  out.push('')
  return out.map(l => truncVisible(l, o.width))
}

export interface ParadaOptions {
  color: boolean
  width: number
  custo: string
  pisoDoGasto: string
}

export function renderParada(id: string, opts: Partial<ParadaOptions> = {}): string[] {
  const o = { ...PADRAO, ...opts, custo: opts.custo ?? '', pisoDoGasto: opts.pisoDoGasto ?? '' }
  const piso = o.pisoDoGasto
  const linha = (tecla: string, texto: string): string =>
    `    ${paint(padVisible(tecla, 10), CYAN, o)}${paint(texto, DIM, o)}`
  return [
    '',
    `  ${paint(`#${id} parado`, YELLOW, o)}${o.custo ? paint(`  ${piso ? '≥ ' : ''}US$${o.custo} ate aqui`, DIM, o) : ''}`,
    ...(piso ? [paint(`  piso: ${piso} sem reporte de gasto`, YELLOW, o)] : []),
    '',
    linha('enter', 'retoma de onde parou'),
    linha(`/rm ${Number(id)}`, 'apaga a tarefa e limpa o worktree'),
    linha('ctrl+c', 'sai do hii — a tarefa fica parada'),
    '',
  ].map(l => truncVisible(l, o.width))
}
