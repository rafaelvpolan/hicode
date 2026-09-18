import type { ValorRecuperacao } from '../../shared/recuperacao'
import { createHash } from 'node:crypto'
import { diagnosticarLocal, importarLocal, prepararLocal, agirNoVinculo, chamarHii, lerVinculo, ErroRecuperacao } from '../hii/recuperacao'
export default defineEventHandler(async event => {
  const b = await readBody<Record<string, ValorRecuperacao>>(event)
  if (!b || typeof b.arquivo !== 'string') throw createError({ statusCode: 400, statusMessage: 'Arquivo obrigatorio' })
  try {
    if (b.acao === 'diagnosticar') return await diagnosticarLocal(b.arquivo)
    if (b.acao === 'importar' && typeof b.hash === 'string') return await importarLocal(b.arquivo, b.hash)
    if (b.acao === 'preparar' && typeof b.revisao === 'string' && typeof b.fingerprint === 'string') return await prepararLocal(b.arquivo, b.revisao, b.fingerprint)
    if (b.acao === 'configurar' && typeof b.hash === 'string' && typeof b.revisao === 'string') {
      const v = lerVinculo(b.arquivo)
      if (!v?.tarefa || v.estado !== 'confirmado') throw new ErroRecuperacao(409, 'Vinculo nao confirmado')
      await chamarHii('/v1/tarefas/' + v.tarefa + '/restaurar-configuracao', { hash: b.hash }, b.revisao, 'configurar-' + createHash('sha256').update(JSON.stringify([v.origem, b.hash, b.revisao])).digest('hex'))
      return await diagnosticarLocal(b.arquivo)
    }
    if (b.acao === 'retomar') { await agirNoVinculo(b.arquivo, 'retomar'); return await diagnosticarLocal(b.arquivo) }
    throw new ErroRecuperacao(400, 'Acao invalida')
  } catch (e) {
    if (e instanceof ErroRecuperacao) throw createError({ statusCode: e.status, statusMessage: e.message })
    throw e
  }
})
