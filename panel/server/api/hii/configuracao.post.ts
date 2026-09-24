import { exigirSessao } from '../../hii/sessao'
import { motorHii } from '../../hii/motor'
import type { PapelHii } from '../../../shared/configuracao-hii'
interface Ajuste { papel: PapelHii; provider: string; model: string; autoReview?: boolean; etag: string; chave: string }
export default defineEventHandler(async event => {
  exigirSessao(event)
  const { cliente } = motorHii()
  const b = await readBody<Ajuste>(event)
  if (!b || !['implement', 'step', 'verify', 'gate'].includes(b.papel) || typeof b.provider !== 'string' ||
    typeof b.model !== 'string' || b.model.length > 200 || (b.autoReview !== undefined && (b.papel !== 'gate' || typeof b.autoReview !== 'boolean')) || typeof b.etag !== 'string' ||
    typeof b.chave !== 'string' || !/^[a-zA-Z0-9-]{8,128}$/.test(b.chave)) throw createError({ statusCode: 400, statusMessage: 'Configuracao invalida' })
  const c = (await cliente.capacidades()).valor.configuracao
  if (!c?.versoes.includes(1) || !c.escrita) throw createError({ statusCode: 403, statusMessage: 'Motor nao autoriza escrita de configuracao' })
  try {
    return await cliente.configurar({ versao: 1, papel: b.papel, provider: b.provider, model: b.model, ...(b.autoReview !== undefined ? { autoReview: b.autoReview } : {}) }, b.chave, b.etag)
  } catch (e) {
    const status = (e as { status?: number }).status
    throw createError({ statusCode: status && [400, 401, 403, 409, 412, 428].includes(status) ? status : 502,
      statusMessage: status === 412 ? 'Configuracao mudou. Releia e compare antes de salvar novamente.' : 'Configuracao nao confirmada pelo motor' })
  }
})
