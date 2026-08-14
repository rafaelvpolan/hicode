import type { Fields, StepMap } from '../card'
import { STATUSES } from '../card'
import type { PipelineStep } from '../runner/pipeline/types'

export type EstadoPasso = 'feito' | 'agora' | 'pendente' | 'pulado'

export interface Passo {
  label: string
  estado: EstadoPasso
}

const ORDEM: readonly string[] = STATUSES

function posicao(status: string): number {
  const i = ORDEM.indexOf(status)
  return i < 0 ? 0 : i
}

function feitoPorEstado(statusCard: string, statusPasso: string): boolean {
  return posicao(statusCard) > posicao(statusPasso)
}

export function passosDoCard(card: Fields, planejados: PipelineStep[], gravados: StepMap | null): Passo[] {
  const status = String(card.status ?? 'INBOX')
  const rodando = ['REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED', 'CLEANED', 'PREVIEW_OK'].includes(status)
  let primeiroPendente = true
  return planejados.map((p) => {
    const registrado = gravados?.[p.label]
    const temTempo = !!registrado && (registrado.time > 0 || registrado.cost > 0)
    if (temTempo || feitoPorEstado(status, p.state)) return { label: p.label, estado: 'feito' as const }
    if (rodando && primeiroPendente) {
      primeiroPendente = false
      return { label: p.label, estado: 'agora' as const }
    }
    return { label: p.label, estado: 'pendente' as const }
  })
}

export function pulados(todos: PipelineStep[], planejados: PipelineStep[]): Passo[] {
  const ativos = new Set(planejados.map(s => s.id))
  return todos.filter(s => !ativos.has(s.id)).map(s => ({ label: s.label, estado: 'pulado' as const }))
}
