import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
import { consultarConfiguracao } from '../../hii/configuracao'
export default defineEventHandler(async event => {
  exigirSessao(event)
  setHeader(event, 'cache-control', 'no-store')
  return consultarConfiguracao(motorHii().cliente)
})
