import { aplicar, limpar, agentRoles, isProviderName, ehEsforco } from '../ia'
import type { AgentRole } from '../ia/tipos'

interface CorpoDaIa {
  papel?: string
  provider?: string
  model?: string
  effort?: string
  padrao?: boolean
}

const RE_MODELO_SEGURO = /^[A-Za-z0-9](?:[A-Za-z0-9._:/-]{0,99})$/

function modeloSeguro(modelo: string | undefined): string | undefined {
  if (!modelo) return undefined
  return RE_MODELO_SEGURO.test(modelo) ? modelo : undefined
}

export default defineEventHandler(async (event) => {
  const corpo = await readBody<CorpoDaIa>(event)
  const papeis = corpo.papel && (agentRoles() as string[]).includes(corpo.papel)
    ? [corpo.papel as AgentRole]
    : agentRoles()
  if (corpo.padrao) return limpar(papeis)
  return aplicar({
    papeis,
    provider: isProviderName(corpo.provider) ? corpo.provider : undefined,
    model: modeloSeguro(corpo.model),
    effort: ehEsforco(corpo.effort) ? corpo.effort : undefined,
  })
})
