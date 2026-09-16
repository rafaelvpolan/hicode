import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
interface Pedido { acao: string; id?: string; texto?: string; modo?: 'gateway' | 'orquestrador'; chave: string; etag?: string; perguntaId?: string; etagPergunta?: string }
export default defineEventHandler(async event => {
  exigirSessao(event)
  const { cliente, repo } = motorHii()
  const b = await readBody<Pedido>(event)
  if (!b || typeof b.chave !== 'string' || !/^[a-zA-Z0-9._:-]{8,128}$/.test(b.chave) || (b.texto && (typeof b.texto !== 'string' || b.texto.length > 16000))) throw createError({ statusCode: 400, statusMessage: 'Pedido invalido' })
  if (b.acao === 'nova_sessao') return (await cliente.novaSessao(repo, b.texto || 'Sessao Hicode', b.chave)).valor
  if (b.acao === 'perguntar') return (await cliente.perguntar(repo, b.texto || '', b.chave)).valor
  if (b.acao === 'pedido' && b.id && ['gateway', 'orquestrador'].includes(b.modo || '')) {
    if ((await cliente.sessao(b.id)).valor.repo !== repo) throw createError({ statusCode: 403, statusMessage: 'Sessao fora do projeto' })
    return (await cliente.pedido(b.id, { modo: b.modo || 'gateway', texto: b.texto || '' }, b.chave)).valor
  }
  if (b.id && ['responder', 'parar', 'retomar', 'confirmar-fecho', 'recusar-fecho', 'aprovar-plano', 'aprovar-url', 'recusar'].includes(b.acao)) {
    const atual = await cliente.tarefa(b.id)
    if (atual.valor.campos.repo !== repo) throw createError({ statusCode: 403, statusMessage: 'Tarefa fora do projeto' })
    if (b.acao === 'responder') {
      if (!b.perguntaId || !b.etagPergunta) throw createError({ statusCode: 428, statusMessage: 'Consulte a pergunta e sua revisao' })
      return (await cliente.responderPergunta(b.id, b.perguntaId, b.texto || '', b.chave, b.etagPergunta)).valor
    }
    if (!b.etag) throw createError({ statusCode: 428, statusMessage: 'Consulte a revisao da tarefa antes de agir' })
    return (await cliente.agir(b.id, b.acao as 'responder' | 'parar' | 'retomar' | 'confirmar-fecho' | 'recusar-fecho' | 'aprovar-plano' | 'aprovar-url' | 'recusar', b.texto || '', b.chave, b.etag)).valor
  }
  throw createError({ statusCode: 400, statusMessage: 'Comando nao suportado' })
})
