import { onMounted, ref, watch, type Ref } from 'vue'
import type { ClarifyQuestion, ClarifyResponse } from '#shared/types'

export interface UseClarifyReturn {
  questions: Ref<ClarifyQuestion[]>
  loaded: Ref<boolean>
  selected: Ref<Record<string, string>>
  selectAnswer: (q: string, answer: string) => void
  collectAnswers: () => { q: string; answer: string }[]
}

export function useClarify(cardId: Ref<string>, status: Ref<string>): UseClarifyReturn {
  const questions = ref<ClarifyQuestion[]>([])
  const loaded = ref(false)
  const selected = ref<Record<string, string>>({})

  async function fetchClarify(): Promise<void> {
    const r = await $fetch<ClarifyResponse>(`/api/cards/${cardId.value}/clarify`).catch(() => null)
    const list = r?.questions || []
    questions.value = list
    const next: Record<string, string> = {}
    for (const item of list) next[item.q] = item.answer || item.recommended
    selected.value = next
    loaded.value = true
  }

  onMounted(() => { if (status.value === 'CLARIFY') void fetchClarify() })
  watch(status, (s) => { if (s === 'CLARIFY') void fetchClarify() })

  function selectAnswer(q: string, answer: string): void {
    selected.value[q] = answer
  }

  function collectAnswers(): { q: string; answer: string }[] {
    return questions.value.map((item) => ({ q: item.q, answer: selected.value[item.q] || item.recommended }))
  }

  return { questions, loaded, selected, selectAnswer, collectAnswers }
}
