export type EstadoDoMotor = 'ligado' | 'desligado' | 'degradado' | 'desconhecido' | 'indisponivel' | 'nao_configurado' | 'nao_autorizado' | 'incompativel' | 'fila_divergente'
export interface StatusMotorApi {
  estado: EstadoDoMotor
  versao: string | null
  versaoEmExecucao: string | null
  consultadoEm: string
  motivo: string
  fila?: string
}
