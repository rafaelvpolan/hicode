import type { AddRepoInput } from '../utils/repos'
import type { AddRepoResponse } from '#shared/types'

export default defineEventHandler(async (event): Promise<AddRepoResponse> => {
  const b = await readBody<AddRepoInput>(event).catch(() => ({}) as AddRepoInput)
  const r = addRepo(b || {})
  if (r.error) setResponseStatus(event, r.error === 'repo ja existe' ? 409 : 400)
  return r
})
