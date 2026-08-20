import { computed, type ComputedRef, type Ref } from 'vue'
import type { Tom } from '#shared/design'
import type { CardView, RunView } from '#shared/types'
import { cardCostLabel, cardFloorReason, isCostFloor } from '#shared/cost-floor'
import { statusEhRevisavel } from '#shared/status'
import { ACTIVE_STATUSES } from './usePhases'
import { runsFor } from './useFormat'
import { tomDeStatus } from './useStatusVisual'

export function ehRevisavel(card: CardView): boolean {
  return statusEhRevisavel(card.status)
}

export function ehPrevisualizavel(card: CardView): boolean {
  return card.shot || !!card.preview_url
}

export interface UseCardResumoReturn {
  execucoes: ComputedRef<RunView[]>
  ultimaExecucao: ComputedRef<RunView | null>
  trabalhando: ComputedRef<boolean>
  custoRotulo: ComputedRef<string>
  custoEstimado: ComputedRef<boolean>
  custoMotivo: ComputedRef<string>
  tom: ComputedRef<Tom>
}

export function useCardResumo(card: Ref<CardView>, runs: Ref<RunView[]>): UseCardResumoReturn {
  const execucoes = computed(() => runsFor(runs.value, card.value.id))
  const ultimaExecucao = computed(() => execucoes.value[execucoes.value.length - 1] ?? null)
  const trabalhando = computed(() => ACTIVE_STATUSES.includes(card.value.status))
  const custoRotulo = computed(() => cardCostLabel(card.value))
  const custoEstimado = computed(() => isCostFloor(card.value))
  const custoMotivo = computed(() => cardFloorReason(card.value))
  const tom = computed(() => tomDeStatus(card.value.status))

  return { execucoes, ultimaExecucao, trabalhando, custoRotulo, custoEstimado, custoMotivo, tom }
}
