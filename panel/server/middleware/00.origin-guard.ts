import { origemAutorizada } from '../utils/origin-guard'

const METODOS_MUTANTES = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default defineEventHandler((event) => {
  const method = event.node.req.method || 'GET'
  if (!METODOS_MUTANTES.has(method)) return

  const origem = getHeader(event, 'origin') || getHeader(event, 'referer') || null
  const hostEsperado = getRequestHost(event, { xForwardedHost: false })
  if (!origemAutorizada(origem, hostEsperado)) {
    throw createError({ statusCode: 403, statusMessage: 'origem nao autorizada' })
  }
})
