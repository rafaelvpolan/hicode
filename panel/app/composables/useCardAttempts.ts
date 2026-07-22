import { onMounted, ref, watch, type Ref } from 'vue'
import type { Attempt, AttemptsResponse } from '#shared/types'

export interface UseCardAttemptsReturn {
  open: Ref<boolean>
  attempts: Ref<Attempt[]>
  toggle: () => void
}

export function useCardAttempts(cardId: Ref<string>, rev: Ref<string>): UseCardAttemptsReturn {
  const open = ref(false)
  const attempts = ref<Attempt[]>([])

  async function fetchAttempts(): Promise<void> {
    const r = await $fetch<AttemptsResponse>(`/api/cards/${cardId.value}/attempts`).catch(() => null)
    attempts.value = (r?.attempts || []).slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
  }

  onMounted(fetchAttempts)
  watch(rev, () => { void fetchAttempts() })

  function toggle(): void {
    open.value = !open.value
  }

  return { open, attempts, toggle }
}
