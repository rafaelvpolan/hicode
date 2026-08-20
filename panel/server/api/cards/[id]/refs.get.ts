import type { RefsResponse } from '#shared/types'

export default defineEventHandler((event): RefsResponse => {
  const id = parseCardId(getRouterParam(event, 'id'))
  if (!id) { setResponseStatus(event, 400); return { id: '', refs: [], error: 'id invalido' } }
  return { id, refs: readRefs(id) }
})
