import type { Fields } from '../../card'
import { PHASES, isActive, phaseIndex, phaseLabel, waitsHuman } from './phases'

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const GREEN = '\x1b[32m'

export interface FleetOptions {
  color: boolean
  repo: string
  daemon: string
  costToday?: string
  costCap?: string
}

const DEFAULTS: FleetOptions = { color: false, repo: '', daemon: 'offline' }

function paint(s: string, code: string, o: FleetOptions): string {
  return o.color ? `${code}${s}${RESET}` : s
}

function bar(status: string): string {
  const i = phaseIndex(status)
  if (i < 0) return '·'.repeat(PHASES.length)
  return '█'.repeat(i + 1) + '·'.repeat(PHASES.length - i - 1)
}

function cell(c: Fields, o: FleetOptions): string {
  const id = `#${String(c.id ?? '').padStart(3, '0')}`
  const status = String(c.status ?? 'INBOX')
  if (status === 'HALTED') return `${paint(id, DIM, o)} ${paint('■■■■■■  parou', RED, o)}`
  if (status === 'PAUSED') return `${paint(id, DIM, o)} ${paint('⏸ pausado', YELLOW, o)}`
  if (status === 'WAITING') return `${paint(id, DIM, o)} ${paint('⏳ aguardando', YELLOW, o)}`
  const cor = status === 'PR_OPEN' || status === 'MERGED' ? GREEN : waitsHuman(status) ? YELLOW : DIM
  return `${paint(id, DIM, o)} ${paint(bar(status), cor, o)}  ${paint(phaseLabel(status).toLowerCase(), cor, o)}`
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function renderFleet(cards: Fields[], opts: Partial<FleetOptions> = {}): string {
  const o = { ...DEFAULTS, ...opts }
  const vivos = cards.filter(c => {
    const s = String(c.status ?? '')
    return isActive(s) || waitsHuman(s) || s === 'PAUSED'
  })
  const ativos = vivos.filter(c => isActive(String(c.status ?? ''))).length
  const esperando = vivos.filter(c => waitsHuman(String(c.status ?? ''))).length
  const out: string[] = []
  const custo = o.costToday ? ` · US$${o.costToday}${o.costCap ? ` / teto US$${o.costCap}` : ''}` : ''
  out.push(paint(`hicode · ${o.repo || 'sem repo'}   daemon ${o.daemon}`, DIM, o))
  out.push(paint(`${ativos} ativo(s) · ${esperando} esperando voce${custo}`, DIM, o))
  if (!vivos.length) return out.join('\n')
  out.push('')
  for (const linha of chunk(vivos, 2)) out.push('  ' + linha.map(c => cell(c, o)).join('   '))
  return out.join('\n')
}
