import type { EventoDoMotor, EventoDoQuadro, MotorDaemonStatus } from '#shared/types'

export type {
  EventoDaemon,
  EventoDoMotor,
  EventoDoQuadro,
  EventoCusto,
  EventoFim,
  EventoHalt,
  EventoPassoConcluido,
  EventoPassoIniciado,
  EventoPausa,
  EventoPergunta,
  EventoSaidaDeFerramenta,
  EventoStatusDoCard,
  EventoVeredito,
  MotivoDePausa,
  MotorDaemonStatus,
  ResultadoDoFim,
} from '#shared/types'

export interface MotorStatus {
  daemon: MotorDaemonStatus
  cardCount: number
  runCount: number
  repoCount: number
  iaConfigured: boolean
}

export interface MotorDispatchOptions {
  timeoutMs?: number
  sigkillGraceMs?: number
}

export interface MotorDispatchResult {
  ok: boolean
  exitCode: number | null
  timedOut: boolean
  stdout: string
  stderr: string
}

export interface MotorAcompanharOptions {
  signal?: AbortSignal
}

export type OrigemDoEntrypoint = 'path' | 'hii-home'

export interface MotorEntrypoint {
  runtime: string
  args: string[]
  origem: OrigemDoEntrypoint
}

export interface MotorClient {
  status(): MotorStatus
  dispatch(args: string[], options?: MotorDispatchOptions): Promise<MotorDispatchResult>
  acompanhar(cardId: string, options?: MotorAcompanharOptions): AsyncIterable<EventoDoMotor>
  acompanharQuadro(options?: MotorAcompanharOptions): AsyncIterable<EventoDoQuadro>
  entrypoint(): MotorEntrypoint | null
}
