export default defineEventHandler((event) => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const ok = deleteCard(id)
  if (!ok) { setResponseStatus(event, 404); return { error: 'card nao encontrado' } }
  return { ok: true }
})
