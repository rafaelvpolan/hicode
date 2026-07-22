import type { RefsResponse } from '#shared/types'

export default defineEventHandler((event): RefsResponse => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  return { id, refs: readRefs(id) }
})
