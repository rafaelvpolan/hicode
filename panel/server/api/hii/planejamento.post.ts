import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
import { salvarPlanejamento, ErroPlanejamento } from '../../hii/planejamento-store'
import { validarPlanejamento } from '../../../shared/planejamento'
import type { Planejamento } from '../../../shared/planejamento'
export default defineEventHandler(async event => {
  exigirSessao(event)
  const { repo, cliente } = motorHii()
  if (!(process.env.HICODE_DISCOVERY_REPOS || '').split(',').includes(repo)) throw createError({ statusCode: 403, statusMessage: 'Descoberta nao habilitada para este projeto' })
  const b = await readBody<{ documento: Planejamento; revisao: number; chave: string; aprovar: boolean }>(event)
  if (!b || b.documento?.repo !== repo || typeof b.aprovar !== 'boolean') throw createError({ statusCode: 400, statusMessage: 'Projeto ou operacao invalida' })
  if (JSON.stringify(b).length > 200000) throw createError({ statusCode: 413, statusMessage: 'Planejamento excede limite de tamanho' })
  const erros = validarPlanejamento(b.documento, b.aprovar)
  if (erros.length) throw createError({ statusCode: 400, statusMessage: 'Revise os campos indicados', data: { campos: erros } })
  for (const t of b.documento.epico?.tarefas || []) {
    if (t.cardExistente && (await cliente.tarefa(t.cardExistente)).valor.campos.repo !== repo) throw createError({ statusCode: 403, statusMessage: 'Tarefa vinculada pertence a outro projeto' })
  }
  try { return salvarPlanejamento(b.documento, b.revisao, b.chave, b.aprovar) }
  catch (e) {
    if (e instanceof ErroPlanejamento) throw createError({ statusCode: e.status, statusMessage: e.message, data: { campos: e.campos } })
    throw createError({ statusCode: 500, statusMessage: 'Nao foi possivel salvar o planejamento' })
  }
})
