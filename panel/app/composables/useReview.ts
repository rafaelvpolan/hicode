import { onScopeDispose, reactive, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { CorrectResponse, FileDiffResponse, ReviewResponse } from '#shared/types'

const AUTO_REFRESH_INTERVAL_MS = 4000

export interface UseReviewReturn {
  open: Ref<boolean>
  cardId: Ref<string>
  data: ShallowRef<ReviewResponse | null>
  loading: Ref<boolean>
  error: Ref<string>
  diffs: Record<string, FileDiffResponse>
  correcting: Ref<boolean>
  openReview: (id: string) => Promise<void>
  close: () => void
  loadFileDiff: (path: string) => Promise<void>
  submitCorrection: (path: string, instruction: string, line?: number, lineContent?: string) => Promise<void>
}

export function useReview(): UseReviewReturn {
  const open = ref(false)
  const cardId = ref('')
  const data = shallowRef<ReviewResponse | null>(null)
  const loading = ref(false)
  const error = ref('')
  const correcting = ref(false)
  const diffs = reactive<Record<string, FileDiffResponse>>({})

  let intervalHandle: ReturnType<typeof setInterval> | null = null

  function clearAutoRefresh(): void {
    if (intervalHandle !== null) {
      clearInterval(intervalHandle)
      intervalHandle = null
    }
  }

  async function refresh(): Promise<void> {
    if (!cardId.value) return
    try {
      const response = await $fetch<ReviewResponse>(`/api/cards/${cardId.value}/review`)
      data.value = response
      correcting.value = response.status === 'CORRECTING' || response.correcting
      error.value = response.error ?? ''
    } catch {
      error.value = 'falha ao carregar review'
    }
  }

  async function openReview(id: string): Promise<void> {
    cardId.value = id
    open.value = true
    loading.value = true
    for (const key of Object.keys(diffs)) delete diffs[key]
    await refresh()
    loading.value = false
    clearAutoRefresh()
    intervalHandle = setInterval(refresh, AUTO_REFRESH_INTERVAL_MS)
  }

  function close(): void {
    clearAutoRefresh()
    open.value = false
    cardId.value = ''
    data.value = null
    error.value = ''
    correcting.value = false
    for (const key of Object.keys(diffs)) delete diffs[key]
  }

  async function loadFileDiff(path: string): Promise<void> {
    if (!cardId.value) return
    try {
      const response = await $fetch<FileDiffResponse>(`/api/cards/${cardId.value}/file-diff`, {
        query: { path },
      })
      diffs[path] = response
    } catch {
      diffs[path] = { path, status: '', before: '', after: '', error: 'falha ao carregar diff' }
    }
  }

  async function submitCorrection(path: string, instruction: string, line?: number, lineContent?: string): Promise<void> {
    if (!cardId.value) return
    correcting.value = true
    try {
      await $fetch<CorrectResponse>(`/api/cards/${cardId.value}/correct`, {
        method: 'POST',
        body: {
          file: path,
          instruction,
          ...(line !== undefined ? { line } : {}),
          ...(lineContent !== undefined ? { lineContent } : {}),
        },
      })
    } finally {
      await refresh()
    }
  }

  onScopeDispose(clearAutoRefresh)

  return {
    open, cardId, data, loading, error, diffs, correcting,
    openReview, close, loadFileDiff, submitCorrection,
  }
}
