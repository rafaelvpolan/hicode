import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
import { lerPlanejamento } from '../../hii/planejamento-store'
import { salvarTecnico, lerTecnico, iniciarEnvio, registrarEnvio, ErroTecnicoStore } from '../../hii/tecnico-store'
import { analisarTecnico } from '../../../shared/contrato-tecnico'
export default defineEventHandler(async event => {
  exigirSessao(event)
  const { repo, cliente } = motorHii()
  if (!(process.env.HICODE_DISCOVERY_REPOS || '').split(',').includes(repo)) throw createError({ statusCode: 403, statusMessage: 'Planejamento desabilitado' })
  const b = await readBody<{ planejamento: string; produto: string; acao: string; fonte: string; revisao: number; chave: string; aprovar: boolean }>(event)
  if (!b || !Number.isSafeInteger(b.revisao) || b.revisao < 0 || !['salvar', 'despachar'].includes(b.acao)) throw createError({ statusCode: 400, statusMessage: 'Operacao invalida' })
  const p = lerPlanejamento(repo, b.planejamento)
  const tarefa = p?.documento.epico?.tarefas.find(t => t.id === b.produto)
  if (!p || !tarefa || !p.descobertaAprovada) throw createError({ statusCode: 409, statusMessage: 'Epico aprovado necessario' })
  try {
    if (b.acao === 'salvar') {
      if (typeof b.aprovar !== 'boolean' || typeof b.fonte !== 'string') throw new ErroTecnicoStore(400, 'Fonte e aprovacao obrigatorias')
      const { documento: d } = analisarTecnico(b.fonte)
      if (!d || d.origem?.revisao !== p.revisao || JSON.stringify(d.dependencias) !== JSON.stringify(tarefa.dependeDe)) throw new ErroTecnicoStore(409, 'Origem ou dependencias divergem da revisao do produto; releia o planejamento')
      return salvarTecnico(repo, b.planejamento, b.produto, b.fonte, b.revisao, b.chave, b.aprovar)
    }
    if (!(await cliente.capacidades()).valor.tecnico?.versoes.includes(1)) throw new ErroTecnicoStore(409, 'Motor sem suporte ao documento tecnico v1')
    const atual = lerTecnico(repo, b.planejamento, b.produto)
    if (!atual) throw new ErroTecnicoStore(404, 'Card tecnico ausente')
    if (atual.revisao !== b.revisao) throw new ErroTecnicoStore(412, 'Revisao mudou; releia antes de despachar')
    if (atual.envio?.estado === 'confirmado') return atual
    const { documento: d } = analisarTecnico(atual.fonte)
    if (!d || d.origem.revisao !== p.revisao || JSON.stringify(d.dependencias) !== JSON.stringify(tarefa.dependeDe)) throw new ErroTecnicoStore(409, 'Produto mudou; revise o card antes de despachar')
    const r = iniciarEnvio(repo, b.planejamento, b.produto, b.revisao)
    const envio = r.envio!
    if (envio.estado === 'confirmado') return r
    const sessao = envio.sessao || (await cliente.novaSessao(repo, d.titulo, `tecnico-s-${envio.chave}`)).valor.id
    registrarEnvio(repo, b.planejamento, b.produto, r.revisao, { ...envio, sessao })
    const execucao = (await cliente.pedido(sessao, { modo: 'orquestrador', tecnico: r.fonte }, `tecnico-e-${envio.chave}`)).valor
    return registrarEnvio(repo, b.planejamento, b.produto, r.revisao, { ...envio, sessao, estado: 'confirmado', execucao: execucao.id, status: execucao.status, mensagem: execucao.mensagem, enfileirada: execucao.enfileirada })
  } catch (e) {
    if (e instanceof ErroTecnicoStore) throw createError({ statusCode: e.status, statusMessage: e.message })
    const remoto = e as { status?: number; corpo?: string }
    if (remoto.status) {
      let mensagem = 'Motor recusou o despacho; confira capacidades e verificadores do projeto'
      try { mensagem = (JSON.parse(remoto.corpo || '{}') as { erro?: { mensagem?: string } }).erro?.mensagem || mensagem } catch { /* resposta nao estruturada */ }
      throw createError({ statusCode: remoto.status, statusMessage: mensagem })
    }
    throw createError({ statusCode: 503, statusMessage: 'Envio sem confirmacao; repita para reconciliar a mesma intencao' })
  }
})
