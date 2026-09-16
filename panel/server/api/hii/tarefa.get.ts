import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
export default defineEventHandler(async event => {
  exigirSessao(event)
  const { cliente, repo } = motorHii()
  const id = getQuery(event).id
  if (typeof id !== 'string') throw createError({ statusCode: 400, statusMessage: 'ID obrigatorio' })
  const t = await cliente.tarefa(id)
  if (t.valor.campos.repo !== repo) throw createError({ statusCode: 403, statusMessage: 'Tarefa fora do projeto' })
  const pergunta = await cliente.perguntas(id)
  return { ...t, pergunta }
})
