import { truncVisible, padVisible } from '../tui/layout'
import { estadoDoPreview } from '../preview-estado'
import type { Card } from '../../card'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'

export interface TarefaOptions {
  color: boolean
  width: number
  vivo: boolean
  subindo: boolean
  temDevServer: boolean
  previewUrl: string
  subs: string[]
  objetivo: string
}

const PADRAO: TarefaOptions = {
  color: false, width: 78, vivo: false, subindo: false,
  temDevServer: false, previewUrl: '', subs: [], objetivo: '',
}

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
  o.subs.forEach((s, i) => out.push(campo(i === 0 ? 'depois' : '', `${i + 1}. ${s}`, o)))

  const preview = estadoDoPreview({
    status, worktree: String(fm.worktree ?? ''), url: o.previewUrl,
    vivo: o.vivo, temDevServer: o.temDevServer, subindo: o.subindo,
  })
  if (preview.url) out.push(campo('preview', `${preview.url}  ${paint(preview.rotulo, DIM, o)}`, o))
  else if (preview.situacao !== 'sem-superficie') out.push(campo('preview', paint(preview.rotulo, DIM, o), o))

  const custo = parseFloat(String(fm.cost_usd ?? '0')) || 0
  const tokens = Number(fm.tokens_total ?? 0)
  const gasto = [custo ? `US$${custo.toFixed(2)}` : '', tokens ? `${Math.round(tokens / 1000)}k tokens` : ''].filter(Boolean)
  if (gasto.length) out.push(campo('gasto', paint(gasto.join(' · '), DIM, o), o))

  out.push('')
  out.push(`  ${paint('escreva para mandar mais instrucoes nesta tarefa', YELLOW, o)}${paint('  ·  /board volta', DIM, o)}`)
  out.push('')
  return out.map(l => truncVisible(l, o.width))
}

export interface ParadaOptions {
  color: boolean
  width: number
  gasto: string
}

export function renderParada(id: string, opts: Partial<ParadaOptions> = {}): string[] {
  const o = { ...PADRAO, ...opts, gasto: opts.gasto ?? '' }
  const linha = (tecla: string, texto: string): string =>
    `    ${paint(padVisible(tecla, 10), CYAN, o)}${paint(texto, DIM, o)}`
  return [
    '',
    `  ${paint(`#${id} parado`, YELLOW, o)}${o.gasto ? paint(`  ${o.gasto} ate aqui`, DIM, o) : ''}`,
    '',
    linha('enter', 'retoma de onde parou'),
    linha(`/rm ${Number(id)}`, 'apaga a tarefa e limpa o worktree'),
    linha('ctrl+c', 'sai do hii — a tarefa fica parada'),
    '',
  ].map(l => truncVisible(l, o.width))
}
