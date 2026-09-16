import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
import { lerPlanejamento, ErroPlanejamento } from '../../hii/planejamento-store'
export default defineEventHandler(event => {
  exigirSessao(event)
  const { repo } = motorHii()
  const habilitado = (process.env.HICODE_DISCOVERY_REPOS || '').split(',').includes(repo)
  if (!habilitado) return { habilitado: false, repo, planejamento: null }
  const id = String(getQuery(event).id || 'principal')
  setHeader(event, 'cache-control', 'no-store')
  try { return { habilitado: true, repo, planejamento: lerPlanejamento(repo, id) } }
  catch (e) {
    if (e instanceof ErroPlanejamento) throw createError({ statusCode: e.status, statusMessage: e.message })
    throw createError({ statusCode: 500, statusMessage: 'Nao foi possivel ler o planejamento' })
  }
})
