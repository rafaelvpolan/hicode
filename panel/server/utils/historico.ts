import type { HistoricoExecucao, HistoricoResponse } from '#shared/types'
import type { ExecucaoEmDisco } from '../motor/execucoes'
import { lerExecucoes } from '../motor/execucoes'
import { readCards } from './card-io'
import type { IdentifiedCard } from './card-io'

function resultadoDe(execucao: ExecucaoEmDisco): HistoricoExecucao['resultado'] {
  if (execucao.ok) return 'sucesso'
  return execucao.failureClass ? 'falha' : 'desconhecido'
}

function tituloDoCard(card: IdentifiedCard | undefined, cardId: string): string {
  return card?.title || card?.slug || `#${cardId}`
}

function paraHistorico(execucao: ExecucaoEmDisco, cardsPorId: Map<string, IdentifiedCard>): HistoricoExecucao {
  const card = cardsPorId.get(execucao.cardId)
  return {
    cardId: execucao.cardId,
    titulo: tituloDoCard(card, execucao.cardId),
    ts: execucao.ts,
    resultado: resultadoDe(execucao),
    custoUsd: execucao.custoUsd,
    custoMedido: execucao.custoMedido,
    duracaoS: execucao.duracaoS,
    tokensTotal: execucao.tokensTotal,
    provider: execucao.provider,
    model: execucao.model,
    veredito: card?.review_verdict || '',
    vereditoMotivo: card?.review_reason || '',
    passos: execucao.steps ?? {},
  }
}

export function historicoDeExecucoes(): HistoricoResponse {
  const cardsPorId = new Map(readCards().map(card => [card.id, card]))
  const { execucoes } = lerExecucoes()
  const dosCards = execucoes.filter(execucao => execucao.tipo === 'execucao')
  const ordenadas = [...dosCards].sort((a, b) => a.tsMs - b.tsMs)
  return { execucoes: ordenadas.map(execucao => paraHistorico(execucao, cardsPorId)) }
}
