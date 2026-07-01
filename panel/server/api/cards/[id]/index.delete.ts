import type { ApiError, OkResponse } from '#shared/types'

export default defineEventHandler((event): OkResponse | ApiError => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const ok = deleteCard(id)
  if (!ok) { setResponseStatus(event, 404); return { error: 'card nao encontrado' } }
  return { ok: true }
})
