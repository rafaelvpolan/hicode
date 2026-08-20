import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { CardView } from '#shared/types'

export interface UseSobreposicoesReturn {
  cardEmReview: Ref<string>
  cardEmPreview: Ref<string>
  cardDoPreview: ComputedRef<CardView | undefined>
  abrirReview: (id: string) => void
  fecharReview: () => void
  abrirPreview: (id: string) => void
  fecharPreview: () => void
}

export function useSobreposicoes(cards: Ref<CardView[]>): UseSobreposicoesReturn {
  const cardEmReview = ref('')
  const cardEmPreview = ref('')

  const cardDoPreview = computed(() => cards.value.find((c) => c.id === cardEmPreview.value))

  function abrirReview(id: string): void {
    cardEmReview.value = id
  }

  function fecharReview(): void {
    cardEmReview.value = ''
  }

  function abrirPreview(id: string): void {
    cardEmPreview.value = id
  }

  function fecharPreview(): void {
    cardEmPreview.value = ''
  }

  return { cardEmReview, cardEmPreview, cardDoPreview, abrirReview, fecharReview, abrirPreview, fecharPreview }
}
