import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
export default defineEventHandler(async event => {
  exigirSessao(event)
  const { repo, cliente } = motorHii()
  const id = String(getQuery(event).execucao || '')
  if (!/^\d{3,12}$/.test(id)) throw createError({ statusCode: 400, statusMessage: 'Execucao invalida' })
  setHeader(event, 'cache-control', 'no-store')
  try {
    if (!(await cliente.capacidades()).valor.avaliacao?.versoes.includes(1)) throw createError({ statusCode: 409, statusMessage: 'Motor sem suporte a avaliacao v1' })
    const a = (await cliente.avaliacao(id)).valor
    if (a.repo !== repo) throw createError({ statusCode: 403, statusMessage: 'Execucao fora do projeto' })
    return a
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode) throw e
    throw createError({ statusCode: 503, statusMessage: 'Nao foi possivel verificar as evidencias desta execucao' })
  }
})
