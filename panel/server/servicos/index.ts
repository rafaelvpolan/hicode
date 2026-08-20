import type { ServicosResponse } from '#shared/types'
import { sondarListaComSeguranca, sondarStatusUnicoComSeguranca } from './executar'
import { sondarGithub } from './github'
import { sondarMcp } from './mcp'
import { sondarMotor } from './motor'
import { sondarProvedoresIa } from './provedores-ia'

const TIMEOUT_SONDA_MS = 8000
const TIMEOUT_SONDA_MCP_MS = 25000

export async function coletarStatusDosServicos(): Promise<ServicosResponse> {
  const [github, mcp, provedores, motor] = await Promise.all([
    sondarStatusUnicoComSeguranca('GitHub', TIMEOUT_SONDA_MS, sondarGithub),
    sondarListaComSeguranca('MCP', TIMEOUT_SONDA_MCP_MS, sondarMcp),
    sondarListaComSeguranca('IA', TIMEOUT_SONDA_MS, sondarProvedoresIa),
    sondarStatusUnicoComSeguranca('Motor (hii)', TIMEOUT_SONDA_MS, sondarMotor),
  ])
  return { servicos: [github, ...mcp, ...provedores, motor], geradoEm: new Date().toISOString() }
}
