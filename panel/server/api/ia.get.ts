import { agentRoles, providerNames, providerNameFor, modelFor, effortFor } from '../../../lib/ai/registry'
import { ESFORCOS } from '../../../lib/ai/preferencias'

export default defineEventHandler(() => ({
  provedores: providerNames(),
  esforcos: [...ESFORCOS],
  papeis: agentRoles().map(papel => ({
    papel,
    provider: providerNameFor(papel),
    model: modelFor(papel) ?? '',
    effort: effortFor(papel) ?? '',
  })),
}))
