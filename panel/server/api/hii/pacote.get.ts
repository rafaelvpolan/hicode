import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
export default defineEventHandler(async event => {
  exigirSessao(event)
  setHeader(event, 'cache-control', 'no-store')
  const { cliente, repo } = motorHii()
  const id = getQuery(event).id
  if (typeof id !== 'string') throw createError({ statusCode: 400, statusMessage: 'ID obrigatorio' })
  if ((await cliente.tarefa(id)).valor.campos.repo !== repo) throw createError({ statusCode: 403, statusMessage: 'Tarefa fora do projeto' })
  const [ia, pacote] = await Promise.all([cliente.iaDaTarefa(id), cliente.pacote(id)])
  return { ia, pacote }
})
