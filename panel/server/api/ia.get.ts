import { agentRoles, providerNames, providerNameFor, modelFor, effortFor, ESFORCOS } from '../ia'

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
