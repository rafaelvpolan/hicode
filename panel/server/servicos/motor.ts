import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { StatusDeServico } from '#shared/types'
import { hiiHome } from '../motor/ambiente'
import { resolverEntrypoint } from '../motor/cli'
import { statusDoDaemon } from '../motor/disco'
import { estadoDeServico } from './executar'

interface PackageJsonDoMotor {
  version?: string
}

function versaoDoMotor(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(hiiHome(), 'package.json'), 'utf8')) as PackageJsonDoMotor
    return pkg.version ?? ''
  } catch {
    return ''
  }
}

function detalheDoDaemon(daemon: ReturnType<typeof statusDoDaemon>): string {
  if (daemon.running) return `daemon rodando (pid ${daemon.pid})`
  return daemon.lockHeld ? 'daemon parado, lock preso' : 'daemon parado'
}

export async function sondarMotor(): Promise<StatusDeServico> {
  const entrypoint = resolverEntrypoint()
  const home = hiiHome()
  if (!entrypoint) {
    return estadoDeServico('Motor (hii)', 'erro', `nao encontrado — nem "hii" no PATH, nem runner.ts em ${home}`, 'instale o hii ou configure HII_HOME')
  }
  if (!existsSync(home)) {
    return estadoDeServico('Motor (hii)', 'atencao', `entrypoint resolvido (${entrypoint.origem}), mas HII_HOME (${home}) nao existe`, 'confira a variavel HII_HOME')
  }
  const versao = versaoDoMotor()
  const detalhe = `instalado (${entrypoint.origem}${versao ? `, v${versao}` : ''}) — ${detalheDoDaemon(statusDoDaemon())}`
  return estadoDeServico('Motor (hii)', 'ok', detalhe)
}
