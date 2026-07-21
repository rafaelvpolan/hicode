import { computed, type ComputedRef, type Ref } from 'vue'
import type { CardStatus, CardView, Kpi, RunView } from '#shared/types'

export const PHASES: [CardStatus, string][] = [
  ['READY', 'Fila'], ['EXECUTING', 'Executando'], ['EXECUTED', 'Feito'], ['PREVIEW', 'Preview'],
  ['PREVIEW_OK', 'Aprovado'], ['REFINED', 'Arquitetura'], ['TESTS_GREEN', 'Testes'],
  ['SEC_CLEARED', 'Segurança'], ['REVIEWED', 'Review'], ['CLEANED', 'Limpeza'],
  ['PR_OPEN', 'PR'], ['MERGED', 'Merge'], ['DEPLOYED', 'Deploy'],
]

export const IN_PROGRESS: CardStatus[] = [
  'SPECCED', 'PLAN_APPROVED', 'EXECUTING', 'EXECUTED', 'REFINED',
  'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED', 'CLEANED',
]

export const ACTIVE_STATUSES: CardStatus[] = [
  'EXECUTING', 'CORRECTING', 'SPECCED', 'REFINED', 'TESTS_GREEN',
  'SEC_CLEARED', 'REVIEWED', 'CLEANED',
]

export interface StepListItem {
  k: string
  l: string
}

export const STEP_LIST: StepListItem[] = [
  { k: 'Fila', l: 'Fila' }, { k: 'Executando', l: 'Executando' }, { k: 'Feito', l: 'Feito' },
  { k: 'Preview', l: 'Preview' }, { k: 'Aprovado', l: 'Aprovado' }, { k: 'Arquitetura', l: 'Arquitetura' },
  { k: 'Testes', l: 'Testes' }, { k: 'Seguranca', l: 'Segurança' }, { k: 'Review', l: 'Review' }, { k: 'Limpeza', l: 'Limpeza' },
  { k: 'Reajuste', l: 'Reajuste' }, { k: 'Conflito', l: 'Conflito' }, { k: 'Revalidacao', l: 'Revalidação' },
  { k: 'Codefox', l: 'Codefox' },
]

export const RESUME_STEP_BY_STATUS: Record<string, string> = {
  REFINED: 'Arquitetura',
  TESTS_GREEN: 'Testes',
  SEC_CLEARED: 'Seguranca',
  REVIEWED: 'Review',
  CLEANED: 'Limpeza',
}

const PHASE_STATUS_ALIAS: Partial<Record<CardStatus, CardStatus>> = {
  SPECCED: 'EXECUTING',
  PLAN_APPROVED: 'EXECUTING',
  CORRECTING: 'EXECUTING',
}

export function phaseIdx(status: CardStatus): number {
  const aliased = PHASE_STATUS_ALIAS[status] ?? status
  return PHASES.findIndex((p) => p[0] === aliased)
}

export function stClass(i: number, idx: number): 'done' | 'now' | 'todo' {
  return i < idx ? 'done' : i === idx ? 'now' : 'todo'
}

export function stepKeyForLabel(label: string): string | null {
  return STEP_LIST.find((s) => s.l === label)?.k ?? null
}

export function usePhases(cards: Ref<CardView[]>, runs: Ref<RunView[]>): {
  kpis: ComputedRef<Kpi[]>
} {
  const kpis = computed<Kpi[]>(() => {
    const c = cards.value
    const n = (s: CardStatus) => c.filter((x) => x.status === s).length
    const tokens = runs.value.reduce((a, r) => a + (Number(r.tokens_total) || 0), 0)
    return [
      { l: 'total', v: String(c.length), k: '' },
      { l: 'na sprint', v: String(n('READY')), k: '' },
      { l: 'em andamento', v: String(c.filter((x) => IN_PROGRESS.includes(x.status)).length), k: '' },
      { l: 'preview', v: String(n('PREVIEW')), k: 'warn' },
      { l: 'PR aberto', v: String(n('PR_OPEN')), k: 'warn' },
      { l: 'HALTED', v: String(n('HALTED')), k: 'bad' },
      { l: 'tokens (total)', v: tokens.toLocaleString('pt-BR'), k: 'ok' },
    ]
  })

  return { kpis }
}
