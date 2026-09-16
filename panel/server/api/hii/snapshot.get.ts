import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
export default defineEventHandler(async event => {
  exigirSessao(event)
  const { cliente, repo } = motorHii()
  const capacidades = (await cliente.capacidades()).valor
  if (!capacidades.observabilidade?.versoes.includes(1)) throw createError({ statusCode: 426, statusMessage: 'Motor requer extensao de observabilidade v1' })
  const primeiro = (await cliente.observarSnapshot({ repo })).valor
  let pagina = primeiro
  while (pagina.proxima) {
    pagina = (await cliente.observarSnapshot({ repo }, pagina.proxima)).valor
    primeiro.atividades.push(...pagina.atividades)
  }
  setHeader(event, 'cache-control', 'no-store')
  return { ...primeiro, repo, proxima: null }
})
