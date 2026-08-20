export type TransporteDoMotor = 'processo-local' | 'http-sse'

export function transporteConfigurado(): TransporteDoMotor {
  return 'processo-local'
}
