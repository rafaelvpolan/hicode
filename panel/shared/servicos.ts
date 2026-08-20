export type FailureClass = 'transient' | 'quota' | 'terminal'

export interface FailureAttempt {
  ts: string
  attempt: number
  fromStatus: string
  provider: string
  failureClass: FailureClass | ''
  failureReason: string
  outcome: 'waiting' | 'halt'
}

export type EstadoDeServico = 'ok' | 'atencao' | 'erro' | 'desconhecido'

export interface StatusDeServico {
  nome: string
  estado: EstadoDeServico
  detalhe: string
  comoResolver: string
}

export interface ServicosResponse {
  servicos: StatusDeServico[]
  geradoEm: string
}

export interface UsoDeProvedor {
  provedor: string
  provedorIdentificado: boolean
  runs: number
  runsComFalha: number
  custoUsd: number
  tokens: number
  modelos: string[]
  primeiroEm: string
  ultimoEm: string
  janelaViraEm: string
  janelaViraDaquiMs: number
  limiteAtingido: boolean
  limiteAtingidoEm: string
  limiteMotivo: string
  cardsNoLimite: string[]
}

export interface LeituraDeCota {
  agora: string
  janelaMs: number
  inicioDaJanela: string
  provedores: UsoDeProvedor[]
  custoUsd: number
  tokens: number
  runs: number
  runsIgnorados: number
}
