import { consultarStatusMotor } from '../hii/status'
import { estadoDeServico } from './executar'
import type { StatusDeServico } from '#shared/types'

export async function sondarMotor(): Promise<StatusDeServico> {
  const s = await consultarStatusMotor()
  const versao = s.versaoEmExecucao || s.versao
  return estadoDeServico('Motor (hii)', s.estado === 'ligado' ? 'ok' : s.estado === 'desligado' ? 'atencao' : 'erro',
    s.motivo + (versao ? ' · versão ' + versao : ''),
    s.estado === 'ligado' ? '' : 'Confira o status no topo e a configuração da API do HII.')
}
