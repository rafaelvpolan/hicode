import { isoNow } from '../card'
import type { Fields } from '../card'
import { allCards } from './card-store'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'

interface Phase {
  label: string
  states: string[]
  color: string
}

const PHASES: Phase[] = [
  { label: 'Fila', states: ['INBOX', 'READY', 'SPECCED', 'PLAN_APPROVED'], color: '\x1b[90m' },
  { label: 'Executar', states: ['EXECUTING', 'EXECUTED'], color: '\x1b[33m' },
  { label: 'Preview', states: ['PREVIEW', 'CORRECTING'], color: '\x1b[36m' },
  { label: 'Aprovado', states: ['PREVIEW_OK'], color: '\x1b[34m' },
  { label: 'Polir', states: ['REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED', 'CLEANED'], color: '\x1b[35m' },
  { label: 'PR', states: ['PR_OPEN', 'MERGED', 'DEPLOYED'], color: '\x1b[32m' },
]

function phaseIndex(status: string): number {
  return PHASES.findIndex(p => p.states.includes(status))
}

function track(status: string): string {
  if (status === 'HALTED') return `${RED}■ ■ ■ ■ ■ ■  parou${RESET}`
  if (status === 'PAUSED') return `${YELLOW}⏸ pausado          ${RESET}`
  const pi = phaseIndex(status)
  return PHASES.map((p, i) => {
    if (i < pi) return `${p.color}█${RESET}`
    if (i === pi) return `${BOLD}${p.color}█${RESET}`
    return `${DIM}·${RESET}`
  }).join(' ')
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

function row(c: Fields & { file: string }): string {
  const id = String(c.id ?? '').padStart(3, '0')
  const title = pad(String(c.title || c.slug || ''), 34)
  const status = pad(String(c.status || 'INBOX'), 13)
  const cost = c.cost_usd ? `$${c.cost_usd}` : ''
  return ` ${DIM}#${id}${RESET}  ${track(String(c.status || 'INBOX'))}  ${status} ${title} ${DIM}${cost}${RESET}`
}

export function renderProgress(): string {
  const cards = allCards().sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
  const out: string[] = []
  out.push(`${BOLD}hicode — progresso${RESET}  ${DIM}${isoNow()} · ${cards.length} cards${RESET}`)
  const legend = PHASES.map(p => `${p.color}${p.label}${RESET}`).join(`${DIM} › ${RESET}`)
  out.push(` ${DIM}pipeline:${RESET} ${legend}`)
  const counts = PHASES.map(p => ({ label: p.label, color: p.color, n: cards.filter(c => p.states.includes(String(c.status || 'INBOX'))).length }))
  const halted = cards.filter(c => c.status === 'HALTED').length
  const summary = counts.filter(x => x.n).map(x => `${x.color}${x.label} ${x.n}${RESET}`).join(`${DIM} · ${RESET}`)
  out.push(` ${summary || `${DIM}vazio${RESET}`}${halted ? `${DIM} · ${RESET}${RED}HALTED ${halted}${RESET}` : ''}`)
  out.push('')
  if (!cards.length) out.push(`${DIM} (nenhum card ainda)${RESET}`)
  for (const c of cards) out.push(row(c))
  return out.join('\n')
}
