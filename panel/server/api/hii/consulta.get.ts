import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
export default defineEventHandler(async event => {
  exigirSessao(event)
  const { cliente, repo } = motorHii()
  const id = getQuery(event).id
  if (typeof id !== 'string') throw createError({ statusCode: 400, statusMessage: 'ID obrigatorio' })
  const c = (await cliente.consulta(id)).valor
  if (c.repo !== repo) throw createError({ statusCode: 403, statusMessage: 'Consulta fora do projeto' })
  return c
})
