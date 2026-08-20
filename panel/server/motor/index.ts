import type { MotorClient } from './types'
import { lerStatus } from './disco'
import { dispatch, resolverEntrypoint } from './cli'
import { acompanharDoDisco } from './eventos'
import { acompanharQuadro } from './quadro'
import { transporteConfigurado, type TransporteDoMotor } from './transporte'

export * from './types'
export * from './ambiente'
export * from './transporte'
export * from './quadro'

const clienteDeProcessoLocal: MotorClient = {
  status: lerStatus,
  dispatch,
  acompanhar: acompanharDoDisco,
  acompanharQuadro,
  entrypoint: resolverEntrypoint,
}

function criarClienteMotor(transporte: TransporteDoMotor): MotorClient {
  if (transporte === 'processo-local') return clienteDeProcessoLocal
  throw new Error(`transporte de motor '${transporte}' ainda nao implementado — ver panel/server/motor/http.ts`)
}

export const motorClient: MotorClient = criarClienteMotor(transporteConfigurado())
