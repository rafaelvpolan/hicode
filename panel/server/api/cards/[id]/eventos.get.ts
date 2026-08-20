import { motorClient } from '../../../motor'
import { transmitirComoSse } from '../../../utils/sse'

export default defineEventHandler((event) => {
  const id = parseCardId(getRouterParam(event, 'id'))
  if (!id || !findCardFile(id)) {
    setResponseStatus(event, 404)
    return { error: 'card nao encontrado' }
  }
  return transmitirComoSse(event, signal => motorClient.acompanhar(id, { signal }))
})
