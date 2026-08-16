import { isoNow } from '../card'
import type { Fields } from '../card'
import { providerNames } from '../ai/registry'
import { patchCardWith } from './card-store'

export function markProviderSubstituted(id: string, requested: string, used: string): void {
  if (!id || !requested || requested === used) return
  patchCardWith(
    id,
    (fm): Fields => (fm.provider_unknown === requested ? {} : { provider_unknown: requested }),
    fm => (fm.provider_unknown === requested
      ? ''
      : `${isoNow()} provedor "${requested}" pedido no card nao existe (provedores: ${providerNames().join(', ')}) — implementando com ${used}`),
  )
}
