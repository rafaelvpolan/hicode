import type { StatusDeServico } from '#shared/types'
import { estadoDeServico, executarComando } from './executar'

const NOME = 'GitHub'

export async function sondarGithub(): Promise<StatusDeServico> {
  const versao = await executarComando('gh', ['--version'])
  if (!versao.ok) {
    return estadoDeServico(NOME, 'erro', 'gh CLI nao encontrado no PATH', 'instale o gh (https://cli.github.com) — sem ele o motor nao abre PR')
  }
  const auth = await executarComando('gh', ['auth', 'status'])
  if (!auth.ok) {
    return estadoDeServico(NOME, 'erro', 'gh instalado mas nao autenticado', 'rode: gh auth login')
  }
  return estadoDeServico(NOME, 'ok', 'autenticado')
}
