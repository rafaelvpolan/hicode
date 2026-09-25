import type { ClarifyResponse } from '#shared/types'
import { perguntaClarifyPelaApi } from '../../../hii/status'

export default defineEventHandler(async (event): Promise<ClarifyResponse> => {
  const id = parseCardId(getRouterParam(event, 'id'))
  if (!id) { setResponseStatus(event, 400); return { id: '', questions: [] } }
  try {
    return { id, questions: await perguntaClarifyPelaApi(id) }
  } catch (error) {
    setResponseStatus(event, 502)
    return { id, questions: [] }
  }
})
