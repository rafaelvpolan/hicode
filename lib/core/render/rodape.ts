import type { Fields } from '../../card'
import { isActive } from './phases'
import { idadeDe } from './board'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'

export const GIRO = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export interface Propriedades {
  provedor: string
  modelo: string
  effort: string
  projeto: string
  custoHoje: string
  divergentes: string[]
}

export interface RodapeOptions {
  color: boolean
  now: number
  width: number
}

const PADRAO: RodapeOptions = { color: false, now: 0, width: 80 }

function paint(s: string, code: string, o: RodapeOptions): string {
  return o.color ? `${code}${s}${RESET}` : s
}

export function quadroDoGiro(now: number): string {
  return GIRO[Math.floor(now / 120) % GIRO.length] ?? GIRO[0] ?? '⠋'
}

export function linhaPropriedades(p: Propriedades, opts: Partial<RodapeOptions> = {}): string {
  const o = { ...PADRAO, ...opts }
  const ia = p.modelo ? `${p.provedor}/${p.modelo}` : p.provedor
  const partes = [
    `ia ${paint(ia, CYAN, o)}`,
    `esforco ${paint(p.effort, CYAN, o)}`,
    p.projeto ? `projeto ${paint(p.projeto, CYAN, o)}` : '',
    p.custoHoje ? `gasto ${paint(`US$${p.custoHoje}`, CYAN, o)}` : '',
  ].filter(Boolean)
  const base = paint(partes.join(paint(' · ', DIM, o)), DIM, o)
  if (!p.divergentes.length) return base
  return `${base}${paint(`  (${p.divergentes.join(' · ')})`, YELLOW, o)}`
}

export interface EmExecucao {
  id: string
  titulo: string
  estado: string
  agente: string
  desde: string
}

export function emExecucao(cards: Fields[], repo: string, now: number, agenteDe: (id: string) => string): EmExecucao[] {
  return cards
    .filter(c => (!repo || c.repo === repo) && isActive(String(c.status ?? '')))
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map(c => ({
      id: String(c.id ?? ''),
      titulo: String(c.title ?? ''),
      estado: String(c.status ?? ''),
      agente: agenteDe(String(c.id ?? '')),
      desde: idadeDe(c.updated, now),
    }))
}

export function linhasExecucao(lista: EmExecucao[], opts: Partial<RodapeOptions> = {}): string[] {
  const o = { ...PADRAO, ...opts }
  if (!lista.length) return [paint('nada em execucao', DIM, o)]
  const giro = quadroDoGiro(o.now)
  return lista.slice(0, 3).map((e) => {
    const meio = [e.estado.toLowerCase(), e.agente, e.desde].filter(Boolean).join(' · ')
    const titulo = e.titulo.slice(0, Math.max(10, o.width - 40))
    return `${paint(giro, CYAN, o)} ${paint(`#${e.id.padStart(3, '0')}`, DIM, o)} ${titulo} ${paint(meio, DIM, o)}`
  })
}
