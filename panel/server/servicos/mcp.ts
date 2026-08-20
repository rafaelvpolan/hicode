import type { StatusDeServico } from '#shared/types'
import { estadoDeServico, executarComando } from './executar'

export type EstadoDoServidorMcp = 'conectado' | 'precisa-auth' | 'desconhecido'
export type EscopoDoServidorMcp = 'dinamico' | 'persistente'

export interface ServidorMcp {
  nome: string
  estado: EstadoDoServidorMcp
}

const RE_PRECISA_AUTH = /needs authentication|not authenticated|unauthorized/i
const RE_CONECTADO = /connected/i
const RE_ESCOPO_DINAMICO = /scope:\s*dynamic config/i

export function lerLinhaDeServidor(linha: string): ServidorMcp | null {
  const bruta = linha.trim()
  const separador = bruta.indexOf(': ')
  if (separador === -1) return null
  const nome = bruta.slice(0, separador).trim()
  if (!nome || nome.includes(' - ')) return null
  const cauda = bruta.slice(separador + 2)
  if (RE_PRECISA_AUTH.test(cauda)) return { nome, estado: 'precisa-auth' }
  if (RE_CONECTADO.test(cauda)) return { nome, estado: 'conectado' }
  return { nome, estado: 'desconhecido' }
}

export function lerListaDeServidores(saida: string): ServidorMcp[] {
  return saida.split('\n').map(lerLinhaDeServidor).filter((s): s is ServidorMcp => s !== null)
}

export function lerEscopo(saidaDoGet: string): EscopoDoServidorMcp {
  return RE_ESCOPO_DINAMICO.test(saidaDoGet) ? 'dinamico' : 'persistente'
}

const TIMEOUT_LISTA_MS = 20000
const TIMEOUT_ESCOPO_MS = 10000

async function escopoDoServidor(nome: string): Promise<EscopoDoServidorMcp | null> {
  const r = await executarComando('claude', ['mcp', 'get', nome], TIMEOUT_ESCOPO_MS)
  return r.ok ? lerEscopo(r.stdout) : null
}

function statusPorEstado(servidor: ServidorMcp, escopo: EscopoDoServidorMcp | null): StatusDeServico {
  const nome = `MCP: ${servidor.nome}`
  if (servidor.estado === 'precisa-auth') {
    return estadoDeServico(nome, 'atencao', 'servidor existe mas pede autenticacao', 'autorize numa sessao interativa (/mcp) — o motor nao roda o fluxo OAuth')
  }
  if (servidor.estado === 'desconhecido') {
    return estadoDeServico(nome, 'desconhecido', 'claude mcp list nao informou o estado deste servidor')
  }
  if (escopo === 'dinamico') {
    return estadoDeServico(nome, 'atencao', 'conectado, mas escopo dinamico (so na sessao interativa)', 'servidor de escopo dinamico nao serve para trabalho headless do motor')
  }
  if (escopo === null) {
    return estadoDeServico(nome, 'desconhecido', 'conectado, mas nao consegui confirmar o escopo (claude mcp get falhou)')
  }
  return estadoDeServico(nome, 'ok', 'conectado, escopo persistente (serve para trabalho headless)')
}

export async function sondarMcp(): Promise<StatusDeServico[]> {
  const lista = await executarComando('claude', ['mcp', 'list'], TIMEOUT_LISTA_MS)
  if (!lista.ok) {
    return [estadoDeServico('MCP', 'erro', 'claude mcp list falhou — CLI do Claude ausente ou sem MCP configurado', 'instale o CLI do Claude Code e configure os servidores MCP')]
  }
  const servidores = lerListaDeServidores(lista.stdout)
  if (!servidores.length) {
    return [estadoDeServico('MCP', 'atencao', 'nenhum servidor MCP configurado', 'configure em claude mcp add')]
  }
  return Promise.all(servidores.map(async servidor => {
    const escopo = servidor.estado === 'conectado' ? await escopoDoServidor(servidor.nome) : null
    return statusPorEstado(servidor, escopo)
  }))
}
