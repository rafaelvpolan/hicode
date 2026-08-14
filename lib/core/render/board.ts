import type { Fields } from '../../card'
import type { Passo } from '../progresso'
import { PHASES, isActive, phaseIndex, phaseLabel, waitsHuman } from './phases'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const GREEN = '\x1b[32m'
const CYAN = '\x1b[36m'

export interface BoardOptions {
  color: boolean
  repo: string
  daemon: string
  now: number
  width: number
  passosDe: (card: Fields) => Passo[]
}

const DEFAULTS: BoardOptions = { color: false, repo: '', daemon: 'offline', now: 0, width: 78, passosDe: () => [] }

const MARCA: Record<Passo['estado'], string> = {
  feito: '●',
  agora: '◐',
  pendente: '○',
  pulado: '·',
}

const MAGENTA = '\x1b[35m'
const AZUL = '\x1b[34m'

export const COR_DO_PASSO: Record<string, string> = {
  Arquitetura: MAGENTA,
  Testes: GREEN,
  Seguranca: RED,
  Segurança: RED,
  Review: CYAN,
  Limpeza: AZUL,
}

const PALETA = [MAGENTA, GREEN, RED, CYAN, AZUL, YELLOW]

export function corDoPasso(label: string, indice = 0): string {
  return COR_DO_PASSO[label] ?? PALETA[indice % PALETA.length] ?? CYAN
}

export function renderPassos(passos: Passo[], o: BoardOptions): string {
  if (!passos.length) return ''
  return passos.map((p, i) => {
    const cor = p.estado === 'feito' || p.estado === 'agora' ? corDoPasso(p.label, i) : DIM
    return paint(MARCA[p.estado], cor, o)
  }).join('')
}

export function renderLegenda(passos: Passo[], o: BoardOptions): string {
  if (!passos.length) return ''
  const itens = passos.map((p, i) => {
    const cor = corDoPasso(p.label, i)
    const marca = paint(MARCA[p.estado], p.estado === 'pendente' || p.estado === 'pulado' ? DIM : cor, o)
    const nome = p.estado === 'feito' || p.estado === 'agora'
      ? paint(p.label.toLowerCase(), cor, o)
      : paint(p.label.toLowerCase(), DIM, o)
    return `${marca} ${nome}`
  })
  return '  ' + itens.join('   ')
}

export function legendaPassos(passos: Passo[]): string {
  const agora = passos.find(p => p.estado === 'agora')
  if (agora) return agora.label.toLowerCase()
  const feitos = passos.filter(p => p.estado === 'feito').length
  return passos.length ? `${feitos}/${passos.length}` : ''
}

function paint(s: string, code: string, o: BoardOptions): string {
  return o.color ? `${code}${s}${RESET}` : s
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

export function idadeDe(updated: string | undefined, now: number): string {
  const t = Date.parse(String(updated ?? ''))
  if (!Number.isFinite(t) || !now) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}min`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

function trilha(status: string, o: BoardOptions): string {
  if (status === 'HALTED') return paint('■■■■■■', RED, o)
  if (status === 'PAUSED') return paint('⏸·····', YELLOW, o)
  const i = phaseIndex(status)
  if (i < 0) return paint('······', DIM, o)
  const cor = status === 'PR_OPEN' || status === 'MERGED' ? GREEN : waitsHuman(status) ? YELLOW : CYAN
  return paint('█'.repeat(i + 1), cor, o) + paint('·'.repeat(PHASES.length - i - 1), DIM, o)
}

function linha(c: Fields, o: BoardOptions): string {
  const id = paint(`#${String(c.id ?? '').padStart(3, '0')}`, DIM, o)
  const custo = c.cost_usd ? paint(`$${c.cost_usd}`, DIM, o) : ''
  const idade = idadeDe(c.updated, o.now)
  const passos = o.passosDe(c)
  const bolinhas = renderPassos(passos, o)
  const onde = legendaPassos(passos) || phaseLabel(String(c.status ?? '')).toLowerCase()
  const meta = [onde, idade].filter(Boolean).join(' · ')
  const titulo = pad(String(c.title ?? ''), Math.max(16, o.width - 52))
  const colunaPassos = bolinhas + ' '.repeat(Math.max(0, 6 - passos.length))
  return `  ${id} ${trilha(String(c.status ?? 'INBOX'), o)} ${colunaPassos} ${titulo} ${pad(meta, 16)} ${custo}`
}

interface Grupo {
  rotulo: string
  cards: Fields[]
}

function agrupar(cards: Fields[]): Grupo[] {
  const st = (c: Fields): string => String(c.status ?? 'INBOX')
  return [
    { rotulo: 'esperando voce', cards: cards.filter(c => waitsHuman(st(c)) && st(c) !== 'HALTED') },
    { rotulo: 'parados', cards: cards.filter(c => st(c) === 'HALTED' || st(c) === 'PAUSED') },
    { rotulo: 'rodando', cards: cards.filter(c => isActive(st(c))) },
    { rotulo: 'na fila', cards: cards.filter(c => ['INBOX', 'READY'].includes(st(c))) },
    { rotulo: 'entregues', cards: cards.filter(c => ['PR_OPEN', 'MERGED', 'DEPLOYED'].includes(st(c))) },
  ].filter(g => g.cards.length)
}

function somaCusto(cards: Fields[]): string {
  const t = cards.reduce((a, c) => a + (parseFloat(String(c.cost_usd ?? '0')) || 0), 0)
  return t ? t.toFixed(2) : '0.00'
}

export function renderBoard(cards: Fields[], opts: Partial<BoardOptions> = {}): string {
  const o = { ...DEFAULTS, ...opts }
  const meus = cards.filter(c => !o.repo || String(c.repo ?? '') === o.repo)
  const out: string[] = []
  out.push(paint(o.repo || '(sem repo)', BOLD, o) + paint(`   daemon ${o.daemon}`, DIM, o))
  out.push(paint(`  ${meus.length} card(s) · US$${somaCusto(meus)} acumulado`, DIM, o))
  out.push(paint('  ' + PHASES.map(p => p.label).join(' › '), DIM, o))
  if (!meus.length) {
    out.push('')
    out.push(paint('  nenhum card neste projeto — escreva a tarefa para criar o primeiro', DIM, o))
    return out.join('\n')
  }
  for (const g of agrupar(meus)) {
    out.push('')
    out.push(paint(`  ${g.rotulo} (${g.cards.length})`, g.rotulo === 'esperando voce' ? YELLOW : DIM, o))
    for (const c of g.cards.sort((a, b) => Number(a.id) - Number(b.id))) out.push(linha(c, o))
  }
  const referencia = meus.map(c => o.passosDe(c)).find(p => p.length)
  if (referencia) {
    out.push('')
    out.push(renderLegenda(referencia.map(p => ({ ...p, estado: 'pendente' as const })), o))
  }
  return out.join('\n')
}

export interface ProjetoResumo {
  name: string
  cards: number
  esperando: number
  rodando: number
  parados: number
  custo: string
  cloneOk: boolean
}

export function resumirProjetos(repos: Array<{ name: string; cloneOk: boolean }>, cards: Fields[]): ProjetoResumo[] {
  return repos.map((r) => {
    const meus = cards.filter(c => String(c.repo ?? '') === r.name)
    const st = (c: Fields): string => String(c.status ?? '')
    return {
      name: r.name,
      cloneOk: r.cloneOk,
      cards: meus.length,
      esperando: meus.filter(c => waitsHuman(st(c)) && st(c) !== 'HALTED').length,
      rodando: meus.filter(c => isActive(st(c))).length,
      parados: meus.filter(c => st(c) === 'HALTED').length,
      custo: somaCusto(meus),
    }
  })
}

export function renderProjetos(lista: ProjetoResumo[], opts: Partial<BoardOptions> = {}): string {
  const o = { ...DEFAULTS, ...opts }
  if (!lista.length) {
    return paint('  nenhum projeto registrado — hii repo add <owner/nome>', DIM, o)
  }
  const out: string[] = [paint('  projetos registrados', DIM, o), '']
  lista.forEach((p, i) => {
    const sinais = [
      p.esperando ? paint(`${p.esperando} esperando voce`, YELLOW, o) : '',
      p.rodando ? paint(`${p.rodando} rodando`, CYAN, o) : '',
      p.parados ? paint(`${p.parados} parado(s)`, RED, o) : '',
    ].filter(Boolean).join(paint(' · ', DIM, o))
    const alerta = p.cloneOk ? '' : paint('  clone ausente', RED, o)
    out.push(`  ${paint(String(i + 1), BOLD, o)}  ${pad(p.name, 34)} ${paint(`${p.cards} card(s)`, DIM, o)}  ${sinais}${alerta}`)
  })
  out.push('')
  out.push(paint('  escolha pelo numero ou pelo nome · enter usa o primeiro', DIM, o))
  return out.join('\n')
}
