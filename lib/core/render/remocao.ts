import { truncVisible, padVisible, visibleLen } from '../tui/layout'
import type { PlanoLote, PlanoRemocao } from '../remover'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'

export interface RemocaoOptions {
  color: boolean
  width: number
  confirmacao: boolean
}

const PADRAO: RemocaoOptions = { color: false, width: 78, confirmacao: true }

function paint(s: string, cor: string, o: RemocaoOptions): string {
  return o.color ? `${cor}${s}${RESET}` : s
}

function custoDe(p: PlanoRemocao): number {
  return parseFloat(p.custo || '0') || 0
}

function limpezaDe(p: PlanoRemocao): string {
  const partes = [
    p.worktree ? 'worktree' : '',
    p.previewPid ? 'preview' : '',
    p.runs.length ? `${p.runs.length} log${p.runs.length > 1 ? 's' : ''}` : '',
  ].filter(Boolean)
  return partes.join(' · ')
}

function regua(largura: number, titulo: string, o: RemocaoOptions): string {
  const marca = `── ${titulo} `
  const resto = Math.max(0, largura - visibleLen(marca) - 2)
  return paint(`  ${marca}${'─'.repeat(resto)}`, DIM, o)
}

function linhaDoCard(p: PlanoRemocao, o: RemocaoOptions, compacto: boolean): string[] {
  const id = paint(`#${p.id}`, BOLD, o)
  const custo = custoDe(p)
  const valor = custo ? `US$${custo.toFixed(2)}` : ''
  const limpeza = limpezaDe(p)
  if (compacto) {
    const titulo = truncVisible(p.titulo, Math.max(8, o.width - 12))
    const out = [`    ${id}  ${titulo}`]
    const cauda = [p.status.toLowerCase(), valor, limpeza].filter(Boolean).join(' · ')
    if (cauda) out.push(paint(`          ${truncVisible(cauda, o.width - 12)}`, DIM, o))
    return out
  }
  const larguraTitulo = Math.max(10, o.width - 34)
  const titulo = padVisible(truncVisible(p.titulo, larguraTitulo - 2), larguraTitulo)
  const status = padVisible(paint(p.status.toLowerCase(), DIM, o), 10)
  const direita = valor ? padVisible(paint(valor, DIM, o), 9) : ' '.repeat(9)
  const out = [`    ${padVisible(id, 6)}${status}${titulo}${direita}`]
  if (limpeza) out.push(paint(`    ${' '.repeat(16)}${limpeza}`, DIM, o))
  return out
}

export function renderRemocao(lote: PlanoLote, forcar: boolean, opts: Partial<RemocaoOptions> = {}): string[] {
  const o = { ...PADRAO, ...opts }
  const compacto = o.width < 62
  const alvos = forcar ? [...lote.removiveis, ...lote.bloqueados] : lote.removiveis
  const out: string[] = ['']

  if (!alvos.length) {
    for (const a of lote.ausentes) out.push(paint(`    #${a} nao existe`, DIM, o))
    for (const b of lote.bloqueados) out.push(paint(`    #${b.id} esta em ${b.status} — pare antes com /stop ${Number(b.id)}`, YELLOW, o))
    out.push('')
    out.push(paint('  nada a apagar', DIM, o))
    out.push('')
    return out
  }

  const quantos = alvos.length === 1 ? 'apagar 1 tarefa' : `apagar ${alvos.length} tarefas`
  out.push(regua(o.width, paint(quantos, RED, o), o))
  out.push('')
  for (const p of alvos) out.push(...linhaDoCard(p, o, compacto))

  const fora = [...lote.ausentes.map(a => `#${a} nao existe`),
    ...(forcar ? [] : lote.bloqueados.map(b => `#${b.id} em ${b.status}, fica`))]
  if (fora.length) {
    out.push('')
    out.push(paint(`    ${truncVisible(fora.join(' · '), o.width - 6)}`, YELLOW, o))
  }

  const total = alvos.reduce((a, p) => a + custoDe(p), 0)
  const comBranch = alvos.filter(p => p.branch).length
  const comPr = alvos.filter(p => p.status === 'PR_OPEN').length
  const resumo = [
    total ? `US$${total.toFixed(2)} ja gastos` : '',
    comBranch ? `${comBranch} branch${comBranch > 1 ? 'es' : ''} fica${comBranch > 1 ? 'm' : ''}` : '',
    comPr ? `${comPr} PR fica${comPr > 1 ? 'm' : ''} aberto${comPr > 1 ? 's' : ''} no GitHub` : '',
  ].filter(Boolean)
  if (resumo.length) {
    out.push('')
    out.push(paint(`    ${truncVisible(resumo.join(' · '), o.width - 6)}`, DIM, o))
  }

  if (o.confirmacao) {
    out.push('')
    out.push(`  ${paint('enter', CYAN, o)}${paint(' confirma · ', DIM, o)}${paint('n', CYAN, o)}${paint(' cancela', DIM, o)}`)
  }
  out.push('')
  return out.map(l => truncVisible(l, o.width).replace(/\s+$/, ''))
}

export function renderResultado(apagados: string[], falhas: { id: string; reason: string }[], opts: Partial<RemocaoOptions> = {}): string[] {
  const o = { ...PADRAO, ...opts }
  const out: string[] = []
  if (apagados.length) {
    const ids = apagados.map(x => `#${x}`).join(' ')
    out.push(`  ${paint('✓', CYAN, o)} ${apagados.length} apagada(s)  ${paint(truncVisible(ids, o.width - 20), DIM, o)}`)
  }
  for (const f of falhas) out.push(paint(`  × #${f.id} ${truncVisible(f.reason, o.width - 10)}`, RED, o))
  return out
}
