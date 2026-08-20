import type { TentativasDoCard } from '#shared/types'
import { tentativasDoCard } from '../../../motor/tentativas'

const VAZIO: TentativasDoCard = { cardId: '', reprovacoesECorrecoes: 0, reajustes: [] }

export default defineEventHandler((event): TentativasDoCard => {
  const id = parseCardId(getRouterParam(event, 'id'))
  if (!id) { setResponseStatus(event, 400); return VAZIO }
  return tentativasDoCard(id)
})
