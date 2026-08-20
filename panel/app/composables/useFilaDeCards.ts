import { computed, type ComputedRef, type Ref } from 'vue'
import type { CardView, Kpi, RunView } from '#shared/types'
import { usePhases } from './usePhases'

export interface UseFilaDeCardsReturn {
  cardsOrdenados: ComputedRef<CardView[]>
  kpis: ComputedRef<Kpi[]>
}

export function useFilaDeCards(cards: Ref<CardView[]>, runs: Ref<RunView[]>): UseFilaDeCardsReturn {
  const { kpis } = usePhases(cards, runs)
  const cardsOrdenados = computed(() => [...cards.value].sort((a, b) => Number(b.id) - Number(a.id)))

  return { cardsOrdenados, kpis }
}
