import { truncVisible, padVisible } from '../tui/layout'
import { corDoPasso } from './board'
import type { Passo } from '../progresso'
import type { StepMetric } from '../../card/types'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'

const SIMBOLO: Record<Passo['estado'], string> = {
  feito: '●',
  agora: '◐',
  pendente: '○',
  pulado: '·',
}

export interface ProcessosOptions {
  color: boolean
  width: number
  metricas: Record<string, StepMetric>
  agente: string
  ferramenta: string
  desde: string
  parado: boolean
}

const PADRAO: ProcessosOptions = {
  color: false, width: 78, metricas: {}, agente: '', ferramenta: '', desde: '', parado: false,
}

function paint(s: string, cor: string, o: ProcessosOptions): string {
  return o.color ? `${cor}${s}${RESET}` : s
}

export function duracao(segundos: number): string {
  if (!segundos || segundos < 0) return ''
  if (segundos < 60) return `${Math.round(segundos)}s`
  if (segundos < 3600) return `${Math.round(segundos / 60)}min`
  return `${(segundos / 3600).toFixed(1)}h`
}

function medidaDe(label: string, o: ProcessosOptions): string {
  const m = o.metricas[label]
  if (!m) return ''
  const partes = [duracao(m.time), m.cost ? `US$${m.cost.toFixed(2)}` : '']
  return partes.filter(Boolean).join(' · ')
}

function agora(o: ProcessosOptions): string {
  if (o.parado) return 'parado aqui'
  return [o.agente, o.ferramenta, o.desde].filter(Boolean).join(' · ') || 'trabalhando…'
}

export function renderProcessos(passos: Passo[], opts: Partial<ProcessosOptions> = {}): string[] {
  const o = { ...PADRAO, ...opts }
  if (!passos.length) return []
  const largura = passos.reduce((a, p) => Math.max(a, p.label.length), 0)
  return passos.map((p, i) => {
    const cor = p.estado === 'pendente' || p.estado === 'pulado' ? DIM : corDoPasso(p.label, i)
    const bolinha = paint(SIMBOLO[p.estado], cor, o)
    const nome = p.estado === 'agora'
      ? paint(padVisible(p.label, largura), BOLD, o)
      : paint(padVisible(p.label, largura), p.estado === 'feito' ? cor : DIM, o)
    const cauda = p.estado === 'feito' ? medidaDe(p.label, o)
      : p.estado === 'agora' ? agora(o)
        : p.estado === 'pulado' ? 'pulado neste perfil' : ''
    const seta = p.estado === 'agora' ? paint(' ←', CYAN, o) : '  '
    const linha = `  ${bolinha} ${nome}${seta} ${paint(cauda, DIM, o)}`
    return truncVisible(linha, o.width)
  })
}

export function linhaDoTotal(passos: Passo[], opts: Partial<ProcessosOptions> = {}): string {
  const o = { ...PADRAO, ...opts }
  const feitos = passos.filter(p => p.estado === 'feito').length
  const tempo = Object.values(o.metricas).reduce((a, m) => a + (m.time || 0), 0)
  const partes = [
    `${feitos}/${passos.length} passos`,
    duracao(tempo),
  ].filter(Boolean)
  return paint(`  ${partes.join(' · ')}`, DIM, o)
}
