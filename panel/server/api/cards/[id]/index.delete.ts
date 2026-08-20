import type { ApiError, OkResponse } from '#shared/types'

export default defineEventHandler((event): OkResponse | ApiError => {
  const id = parseCardId(getRouterParam(event, 'id'))
  if (!id) { setResponseStatus(event, 400); return { error: 'id invalido' } }
  const ok = deleteCard(id)
  if (!ok) { setResponseStatus(event, 404); return { error: 'card nao encontrado' } }
  return { ok: true }
})
