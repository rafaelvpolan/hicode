import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { CardStatus, LogResponse } from '#shared/types'
import { ACTIVE_STATUSES } from './usePhases'
import { useFluxoDoMotor } from './useFluxoDoMotor'

const POLL_DE_SEGURANCA_MS = 10000

export type CardLogSource = 'estado' | 'ia'

const ENDPOINT_BY_SOURCE: Record<CardLogSource, string> = {
  estado: 'log',
  ia: 'ai-log',
}

const EMPTY_MESSAGE_BY_SOURCE: Record<CardLogSource, string> = {
  estado: 'sem log disponível',
  ia: 'sem saída da IA ainda — aparece quando o card executa',
}

export interface UseCardLogReturn {
  open: Ref<boolean>
  source: Ref<CardLogSource>
  text: Ref<string>
  isPolling: ComputedRef<boolean>
  toggle: () => Promise<void>
  selectSource: (source: CardLogSource) => Promise<void>
}

export function useCardLog(cardId: Ref<string>, status: Ref<CardStatus>): UseCardLogReturn {
  const open = ref(false)
  const source = ref<CardLogSource>('estado')
  const text = ref('')
  const { porCard } = useFluxoDoMotor()
  const versaoAoVivoDoCard = computed(() => porCard.value.get(cardId.value)?.versao ?? 0)
  let timer: ReturnType<typeof setInterval> | null = null

  async function fetchLog(): Promise<void> {
    const endpoint = ENDPOINT_BY_SOURCE[source.value]
    const r = await $fetch<LogResponse>(`/api/cards/${cardId.value}/${endpoint}`).catch(() => null)
    text.value = r?.log || EMPTY_MESSAGE_BY_SOURCE[source.value]
  }

  const isActive = computed(() => ACTIVE_STATUSES.includes(status.value))
  const isPolling = computed(() => open.value && isActive.value)

  function stopPolling(): void {
    if (timer) { clearInterval(timer); timer = null }
  }

  function syncPolling(): void {
    const shouldPoll = isPolling.value
    stopPolling()
    if (!shouldPoll) return
    fetchLog()
    timer = setInterval(fetchLog, POLL_DE_SEGURANCA_MS)
  }

  watch(isPolling, syncPolling)
  watch(versaoAoVivoDoCard, () => { if (isPolling.value) void fetchLog() })
  watch(status, (next, prev) => {
    if (ACTIVE_STATUSES.includes(next) && !ACTIVE_STATUSES.includes(prev)) {
      open.value = true
      source.value = 'ia'
    }
  })
  onScopeDispose(stopPolling)

  async function toggle(): Promise<void> {
    open.value = !open.value
    if (open.value) await fetchLog()
    syncPolling()
  }

  async function selectSource(next: CardLogSource): Promise<void> {
    if (source.value === next) return
    source.value = next
    if (open.value) await fetchLog()
    syncPolling()
  }

  return { open, source, text, isPolling, toggle, selectSource }
}
