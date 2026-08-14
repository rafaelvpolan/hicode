import type { Plan, PlanWave } from '../plan'
import { link } from '../tui/layout'

const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'
const ACC = '\x1b[36m'
const WARN = '\x1b[33m'

export interface RenderOptions {
  color: boolean
  width: number
}

export const DEFAULT_RENDER: RenderOptions = { color: false, width: 78 }

function paint(s: string, code: string, o: RenderOptions): string {
  return o.color ? `${code}${s}${RESET}` : s
}

function rule(label: string, o: RenderOptions): string {
  const head = label ? `── ${label} ` : '── '
  return paint(head + '─'.repeat(Math.max(0, o.width - head.length)), DIM, o)
}

function oneLine(s: string, max: number): string {
  const flat = String(s || '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
}

function flag(name: string, on: boolean, reason: string, o: RenderOptions): string {
  const mark = paint((on ? 'SIM' : 'nao').padEnd(4), on ? ACC : DIM, o)
  return `    ${name.padEnd(10)} ${mark}  ${paint(oneLine(reason, o.width - 22), DIM, o)}`
}

function waveLine(w: PlanWave, o: RenderOptions): string[] {
  if (w.steps.length === 1) {
    const s = w.steps[0]
    if (!s) return []
    const gate = s.gated ? paint(' [crivo]', DIM, o) : ''
    return [`    ${paint(`${w.n}.`, ACC, o)} ${s.label.padEnd(14)} ${paint(s.agent, DIM, o)}${gate}`]
  }
  const out: string[] = []
  w.steps.forEach((s, i) => {
    const bracket = i === 0 ? '┌' : i === w.steps.length - 1 ? '└' : '│'
    const prefix = i === 0 ? `    ${paint(`${w.n}.`, ACC, o)} ` : '       '
    const gate = s.gated ? paint(' [crivo]', DIM, o) : ''
    const tail = i === 0 ? paint('  ← paralelo', WARN, o) : ''
    out.push(`${prefix}${bracket} ${s.label.padEnd(14)} ${paint(s.agent, DIM, o)}${gate}${tail}`)
  })
  return out
}

export function renderPlan(plan: Plan, opts: Partial<RenderOptions> = {}): string {
  const o = { ...DEFAULT_RENDER, ...opts }
  const out: string[] = []
  out.push(paint(`PLANO · card #${plan.id}`, BOLD, o) + paint(`   perfil ${plan.profile}`, DIM, o))
  out.push('')
  out.push(`    ${'Objetivo'.padEnd(10)} ${oneLine(plan.objetivo, o.width - 16)}`)
  out.push(`    ${'Alvo'.padEnd(10)} ${oneLine(plan.repo, o.width - 16)}`)
  if (plan.previewUrl || plan.previewRotulo) {
    const rotulo = plan.previewComando ? `${plan.previewRotulo} — ${plan.previewComando} sobe` : plan.previewRotulo
    const url = plan.previewUrl ? (o.color ? link(plan.previewUrl) : plan.previewUrl) : ''
    const corpo = url ? `${url}  ${paint(rotulo, DIM, o)}` : paint(rotulo, DIM, o)
    out.push(`    ${'Preview'.padEnd(10)} ${corpo}`)
  }
  out.push(flag('Layout', plan.layout.on, plan.layout.reason, o))
  out.push(flag('Pilha', plan.pilha.on, plan.pilha.reason, o))
  out.push('')
  out.push(rule('Realizacao', o))
  if (!plan.waves.length) out.push(paint('    (nenhum passo de polimento neste perfil)', DIM, o))
  for (const w of plan.waves) out.push(...waveLine(w, o))
  if (plan.skipped.length) {
    out.push('')
    out.push(`    ${paint('pula', DIM, o)} ${plan.skipped.join(', ')}`)
  }
  out.push(`    ${paint('motivo', DIM, o)} ${plan.profileReason}`)
  out.push('')
  out.push(rule('Execucao', o))
  out.push(`    hii approve ${plan.id} --plan     ${paint('aprova o plano e enfileira', DIM, o)}`)
  out.push(`    hii halt ${plan.id} "motivo"      ${paint('descarta o card', DIM, o)}`)
  out.push(`    ${paint('no REPL: enter aprova · /ok <id> aprova o preview depois', DIM, o)}`)
  out.push('')
  out.push(paint('    Nada foi executado.', WARN, o))
  return out.join('\n')
}
