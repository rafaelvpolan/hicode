import type { ApiError, PreviewShotResponse } from '#shared/types'

export default defineEventHandler(async (event): Promise<PreviewShotResponse | ApiError> => {
  const id = parseCardId(getRouterParam(event, 'id'))
  if (!id) { setResponseStatus(event, 400); return { error: 'id invalido' } }

  const card = readCards().find((c) => c.id === id)
  const url = card?.preview_url || ''
  if (!url) { setResponseStatus(event, 409); return { error: 'card sem preview_url — inicie o preview primeiro' } }

  const captured = captureScreenshot(id, url)
  return { ok: true, captured }
})
