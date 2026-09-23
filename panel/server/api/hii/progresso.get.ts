import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
import { lerPlanejamento, ErroPlanejamento } from '../../hii/planejamento-store'
import { lerTecnico } from '../../hii/tecnico-store'
import { progressoDaTarefa } from '../../hii/progresso-produto'
import { tarefasQueContam } from '../../../shared/progresso-produto'
import type { PaginaDeProgresso, ProgressoProduto } from '../../../shared/progresso-produto'
export default defineEventHandler(async (event): Promise<PaginaDeProgresso> => {
  exigirSessao(event)
  const { repo, cliente } = motorHii()
  if (!(process.env.HICODE_DISCOVERY_REPOS || '').split(',').includes(repo)) throw createError({ statusCode: 403, statusMessage: 'Planejamento desabilitado' })
  const q = getQuery(event)
  const id = String(q.planejamento || '')
  const revisao = Number(q.revisao)
  const depois = Number(q.depois || 0)
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !Number.isSafeInteger(revisao) || revisao <= 0 || !Number.isSafeInteger(depois) || depois < 0) throw createError({ statusCode: 400, statusMessage: 'Planejamento, revisao e pagina invalidos' })
  setHeader(event, 'cache-control', 'no-store')
  try {
    const p = lerPlanejamento(repo, id)
    if (!p || !p.documento.epico) throw createError({ statusCode: 404, statusMessage: 'Epico ausente' })
    if (p.revisao !== revisao) throw createError({ statusCode: 409, statusMessage: 'Planejamento mudou; releia antes de consultar progresso' })
    if (!(await cliente.capacidades()).valor.avaliacao?.versoes.includes(1)) throw createError({ statusCode: 409, statusMessage: 'Motor sem suporte a avaliacao de evidencias v1' })
    const todas = tarefasQueContam(p.documento.epico.tarefas)
    const pagina = todas.slice(depois, depois + 20)
    const tarefas: ProgressoProduto[] = []
    // Limite de quatro leituras simultaneas; nao ha POST nem novo executor.
    for (let i = 0; i < pagina.length; i += 4) {
      tarefas.push(...await Promise.all(pagina.slice(i, i + 4).map(async t => {
        try {
          const tecnico = lerTecnico(repo, id, t.id)
          const resultado = await progressoDaTarefa(p, t, tecnico, async execucao => (await cliente.avaliacao(execucao)).valor)
          const atual = lerTecnico(repo, id, t.id)
          if (atual?.revisao !== tecnico?.revisao || atual?.hash !== tecnico?.hash) return { ...resultado, estado: 'revisao_pendente' as const, motivo: 'Card tecnico mudou durante a consulta; consulte novamente.', avaliacao: null }
          return resultado
        }
        catch { return { id: t.id, titulo: t.titulo, dependeDe: t.dependeDe, execucao: '', estado: 'inconclusiva' as const, motivo: 'Revisao tecnica inconsistente; confira os dados antes de continuar.', avaliacao: null } }
      })))
    }
    const atual = lerPlanejamento(repo, id)
    if (atual?.hash !== p.hash || atual.revisao !== p.revisao) throw createError({ statusCode: 409, statusMessage: 'Planejamento mudou durante a consulta' })
    return { versao: 1, repo, planejamento: id, revisao, total: todas.length, tarefas,
      proxima: depois + pagina.length < todas.length ? depois + pagina.length : null, consultadaEm: new Date().toISOString() }
  } catch (e) {
    if (e instanceof ErroPlanejamento) throw createError({ statusCode: e.status, statusMessage: e.message })
    if ((e as { statusCode?: number }).statusCode) throw e
    throw createError({ statusCode: 503, statusMessage: 'Motor indisponivel; progresso nao verificado' })
  }
})
