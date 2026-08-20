import type { CardStatus } from './types'
import type { FailureAttempt, LeituraDeCota } from './servicos'

export interface MotorDaemonStatus {
  pid: number | null
  running: boolean
  lockHeld: boolean
}

export interface EventoPassoIniciado {
  tipo: 'passo_iniciado'
  ts: string
  passo: string
}

export interface EventoPassoConcluido {
  tipo: 'passo_concluido'
  ts: string
  passo: string
  custoUsd: number
  custoMedido: boolean
  tokens: number
  duracaoS: number
}

export interface EventoSaidaDeFerramenta {
  tipo: 'saida_de_ferramenta'
  ts: string
  ferramenta: string
  entrada: string
  resultado: string | null
}

export interface EventoCusto {
  tipo: 'custo'
  ts: string
  usd: number
  acumuladoUsd: number
}

export interface EventoVeredito {
  tipo: 'veredito'
  ts: string
  veredito: string
  motivo: string
}

export interface EventoPergunta {
  tipo: 'pergunta'
  ts: string
  pergunta: string
  opcoes: string[]
  recomendada: string
}

export interface EventoHalt {
  tipo: 'halt'
  ts: string
  motivo: string
}

export type ResultadoDoFim = 'sucesso' | 'falha'

export interface EventoFim {
  tipo: 'fim'
  ts: string
  resultado: ResultadoDoFim
  custoUsd: number
}

export type MotivoDePausa = 'aguardando_aprovacao_url' | 'pergunta_aberta' | 'pausa_manual'

export interface EventoPausa {
  tipo: 'pausa'
  ts: string
  motivo: MotivoDePausa
  status: CardStatus
}

export interface EventoStatusDoCard {
  tipo: 'status'
  ts: string
  status: CardStatus
  statusAnterior: CardStatus | null
}

export interface EventoDaemon {
  tipo: 'daemon'
  ts: string
  status: MotorDaemonStatus
}

export type EventoDoMotor =
  | EventoPassoIniciado
  | EventoPassoConcluido
  | EventoSaidaDeFerramenta
  | EventoCusto
  | EventoVeredito
  | EventoPergunta
  | EventoHalt
  | EventoFim
  | EventoPausa
  | EventoStatusDoCard
  | EventoDaemon

export type EventoDoQuadro = EventoDoMotor & { cardId: string }

export interface FilaPorStatus {
  status: CardStatus
  cardIds: string[]
}

export interface WorktreeAtivo {
  cardId: string
  caminho: string
  branch: string
  existe: boolean
}

export interface PrAberto {
  cardId: string
  url: string
  status: CardStatus
}

export interface GateCodefox {
  cardId: string
  veredito: string
  motivo: string
}

export interface CustoPorRepo {
  repo: string
  custoUsd: number
  piso: boolean
  pisoProvedores: string[]
}

export interface TentativasDoCard {
  cardId: string
  reprovacoesECorrecoes: number
  reajustes: FailureAttempt[]
}

export interface MotorEstadoResponse {
  geradoEm: string
  fila: FilaPorStatus[]
  tentativas: TentativasDoCard[]
  quota: LeituraDeCota
  custoTotalUsd: number
  custoPorRepo: CustoPorRepo[]
  gates: GateCodefox[]
  worktreesAtivos: WorktreeAtivo[]
  prsAbertos: PrAberto[]
  lacunas: string[]
}
