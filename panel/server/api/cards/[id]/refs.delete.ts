import type { RefsResponse } from '#shared/types'

interface RefsDeleteQuery {
  idx?: string
}

export default defineEventHandler((event): RefsResponse => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const query = getQuery<RefsDeleteQuery>(event)
  const index = Number(query.idx)
  if (!Number.isInteger(index) || index < 0) {
    setResponseStatus(event, 400)
    return { id, refs: readRefs(id), error: 'idx invalido' }
  }
  return { id, refs: removeRefAt(id, index) }
})
