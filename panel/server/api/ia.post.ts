import { aplicar, limpar } from '../../../lib/core/escolher-ia'
import { agentRoles } from '../../../lib/ai/registry'
import type { AgentRole } from '../../../lib/ai/types'

interface CorpoDaIa {
  papel?: string
  provider?: string
  model?: string
  effort?: string
  padrao?: boolean
}

export default defineEventHandler(async (event) => {
  const corpo = await readBody<CorpoDaIa>(event)
  const papeis = corpo.papel && (agentRoles() as string[]).includes(corpo.papel)
    ? [corpo.papel as AgentRole]
    : agentRoles()
  if (corpo.padrao) return limpar(papeis)
  return aplicar({ papeis, provider: corpo.provider, model: corpo.model, effort: corpo.effort })
})
