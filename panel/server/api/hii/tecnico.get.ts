import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
import { lerPlanejamento } from '../../hii/planejamento-store'
import { lerTecnico } from '../../hii/tecnico-store'
import { modeloTecnico } from '../../../shared/tecnico'
export default defineEventHandler(async event => {
  exigirSessao(event)
  const { repo, cliente } = motorHii()
  if (!(process.env.HICODE_DISCOVERY_REPOS || '').split(',').includes(repo)) throw createError({ statusCode: 403, statusMessage: 'Planejamento desabilitado' })
  const q = getQuery(event)
  const planejamento = String(q.planejamento || '')
  const produto = String(q.produto || '')
  const p = lerPlanejamento(repo, planejamento)
  const t = p?.documento.epico?.tarefas.find(t => t.id === produto)
  if (!p || !t || !p.descobertaAprovada) throw createError({ statusCode: 409, statusMessage: 'Salve o epico com sintese aprovada antes de detalhar a tarefa' })
  const capacidades = (await cliente.capacidades()).valor
  return { repo, planejamento, produto, revisao: lerTecnico(repo, planejamento, produto), modelo: modeloTecnico(p, t),
    despachoDisponivel: capacidades.tecnico?.versoes.includes(1) === true }
})
