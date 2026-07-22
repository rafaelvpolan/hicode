import { reactive } from 'vue'
import type { CardActionResponse, RejectingForm } from '#shared/types'

export interface UseCardRejectOptions {
  load: () => Promise<void>
}

export interface UseCardRejectReturn {
  rejecting: RejectingForm
  openReject: (id: string) => void
  closeReject: () => void
  confirmReject: () => Promise<void>
}

export function useCardReject(options: UseCardRejectOptions): UseCardRejectReturn {
  const { load } = options
  const rejecting = reactive<RejectingForm>({ open: false, id: '', reason: '' })

  function openReject(id: string): void {
    rejecting.id = id
    rejecting.reason = ''
    rejecting.open = true
  }

  function closeReject(): void {
    rejecting.open = false
  }

  async function confirmReject(): Promise<void> {
    const id = rejecting.id
    const reason = rejecting.reason.trim()
    rejecting.open = false
    await $fetch<CardActionResponse>(`/api/cards/${id}/reject`, { method: 'POST', body: { reason } })
    await load()
  }

  return { rejecting, openReject, closeReject, confirmReject }
}
