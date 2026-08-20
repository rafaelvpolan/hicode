import type { StepMetric } from './types'

export interface HistoricoExecucao {
  cardId: string
  titulo: string
  ts: string
  resultado: 'sucesso' | 'falha' | 'desconhecido'
  custoUsd: number
  custoMedido: boolean
  duracaoS: number
  tokensTotal: number
  provider: string
  model: string
  veredito: string
  vereditoMotivo: string
  passos: Record<string, StepMetric>
}

export interface HistoricoResponse {
  execucoes: HistoricoExecucao[]
}
