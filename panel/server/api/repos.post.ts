export default defineEventHandler(async (event) => {
  const b = await readBody(event)
  const r = addRepo(b || {})
  if (r.error) setResponseStatus(event, r.error === 'repo ja existe' ? 409 : 400)
  return r
})
