import { computed, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { CardStatus, CardView, FailureAttempt, TentativasDoCard } from '#shared/types'
import { statusCanonicoOuNulo, statusDoMotor } from '#shared/status'

export interface UseFaseDaFalhaReturn {
  faseDaFalha: ComputedRef<CardStatus | null>
  parado: ComputedRef<boolean>
}

function ultimoHalt(reajustes: FailureAttempt[]): FailureAttempt | null {
  for (let i = reajustes.length - 1; i >= 0; i -= 1) {
    const reajuste = reajustes[i]
    if (reajuste?.outcome === 'halt') return reajuste
  }
  return null
}

export function useFaseDaFalha(card: Ref<CardView>): UseFaseDaFalhaReturn {
  const reajustes = ref<FailureAttempt[]>([])
  const parado = computed<boolean>(() => statusDoMotor(card.value.status) === 'HALTED')

  async function carregar(): Promise<void> {
    if (!parado.value) {
      reajustes.value = []
      return
    }
    const resposta = await $fetch<TentativasDoCard>(`/api/cards/${card.value.id}/falhas`).catch(() => null)
    reajustes.value = resposta?.reajustes ?? []
  }

  onMounted(carregar)
  watch([parado, () => card.value.updated], () => { void carregar() })

  const faseDaFalha = computed<CardStatus | null>(() => {
    if (!parado.value) return null
    const halt = ultimoHalt(reajustes.value)
    return halt ? statusCanonicoOuNulo(halt.fromStatus) : null
  })

  return { faseDaFalha, parado }
}
