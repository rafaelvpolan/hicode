import { onMounted, ref, watch, type Ref } from 'vue'
import type { RefsResponse } from '#shared/types'

const MAX_REFS = 8

export interface UseCardRefsReturn {
  refs: Ref<string[]>
  loading: Ref<boolean>
  error: Ref<string>
  linkInput: Ref<string>
  atCap: Ref<boolean>
  addLink: () => Promise<void>
  uploadFiles: (files: FileList) => Promise<void>
  removeAt: (index: number) => Promise<void>
  isUrl: (source: string) => boolean
  thumbSrc: (source: string, index: number) => string
}

function fetchErrorPayload(e: { data?: RefsResponse }): RefsResponse | null {
  return e?.data ?? null
}

export function useCardRefs(cardId: Ref<string>): UseCardRefsReturn {
  const refs = ref<string[]>([])
  const loading = ref(false)
  const error = ref('')
  const linkInput = ref('')
  const atCap = ref(false)

  function syncCap(): void {
    atCap.value = refs.value.length >= MAX_REFS
  }

  async function load(): Promise<void> {
    if (!cardId.value) { refs.value = []; syncCap(); return }
    loading.value = true
    const response = await $fetch<RefsResponse>(`/api/cards/${cardId.value}/refs`).catch(() => null)
    refs.value = response?.refs || []
    syncCap()
    loading.value = false
  }

  onMounted(load)
  watch(cardId, load)

  async function addLink(): Promise<void> {
    const link = linkInput.value.trim()
    if (!link) return
    error.value = ''
    const response = await $fetch<RefsResponse>(`/api/cards/${cardId.value}/refs`, {
      method: 'POST',
      body: { links: [link] },
    }).catch(fetchErrorPayload)
    if (!response || response.error) { error.value = response?.error || 'falha ao adicionar link'; return }
    refs.value = response.refs
    syncCap()
    linkInput.value = ''
  }

  async function uploadFiles(files: FileList): Promise<void> {
    const list = Array.from(files)
    if (!list.length) return
    error.value = ''
    const formData = new FormData()
    for (const file of list) formData.append('file', file, file.name)
    const response = await $fetch<RefsResponse>(`/api/cards/${cardId.value}/refs`, {
      method: 'POST',
      body: formData,
    }).catch(fetchErrorPayload)
    if (!response || response.error) { error.value = response?.error || 'falha ao enviar imagem'; return }
    refs.value = response.refs
    syncCap()
  }

  async function removeAt(index: number): Promise<void> {
    error.value = ''
    const response = await $fetch<RefsResponse>(`/api/cards/${cardId.value}/refs`, {
      method: 'DELETE',
      query: { idx: index },
    }).catch(fetchErrorPayload)
    if (!response || response.error) { error.value = response?.error || 'falha ao remover referência'; return }
    refs.value = response.refs
    syncCap()
  }

  function isUrl(source: string): boolean {
    return /^https?:\/\//i.test(source)
  }

  function thumbSrc(source: string, index: number): string {
    return isUrl(source) ? source : `/api/refs/${cardId.value}/${index}`
  }

  return { refs, loading, error, linkInput, atCap, addLink, uploadFiles, removeAt, isUrl, thumbSrc }
}
