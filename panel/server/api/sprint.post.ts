import type { SprintFeatureInput } from '../utils/card-mutations'
import type { CreateSprintResponse } from '#shared/types'

interface SprintBody {
  repo?: string
  features?: SprintFeatureInput[]
}

export default defineEventHandler(async (event): Promise<CreateSprintResponse> => {
  const b = await readBody<SprintBody>(event).catch(() => ({}) as SprintBody)
  return createSprint(b?.repo || '', Array.isArray(b?.features) ? b.features : [])
})
