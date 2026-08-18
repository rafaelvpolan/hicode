import { run } from '../runner/git'
import { lerListaDeServidores, lerEscopo, disponibilidadeExterna } from './mcp-estado'
import type { ServidorMcp, EscopoServidor, DisponibilidadeExterna } from './mcp-estado'

const MCP_PREFIX = 'mcp__'
const MCP_LIST_TIMEOUT_MS = 20000

export function prefixoDe(servidor: string): string {
  return `${MCP_PREFIX}${servidor.replace(/[^a-zA-Z0-9]+/g, '_')}`
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function servidoresPara(ferramenta: string, servidores: string[]): string[] {
  const alvo = normalizar(ferramenta ?? '').trim()
  if (!alvo) return []
  return servidores.filter(servidor => normalizar(servidor).includes(alvo))
}

async function servidoresComEstado(): Promise<ServidorMcp[]> {
  try {
    const { err, stdout } = await run('claude', ['mcp', 'list'], { timeout: MCP_LIST_TIMEOUT_MS })
    if (err) return []
    return lerListaDeServidores(stdout)
  } catch {
    return []
  }
}

async function escopoDe(nome: string): Promise<EscopoServidor> {
  try {
    const { err, stdout } = await run('claude', ['mcp', 'get', nome], { timeout: MCP_LIST_TIMEOUT_MS })
    if (err) return 'persistente'
    return lerEscopo(stdout)
  } catch {
    return 'persistente'
  }
}

let estadoCache: Promise<ServidorMcp[]> | undefined

export async function conectorExterno(ferramenta: string): Promise<DisponibilidadeExterna> {
  if (!estadoCache) estadoCache = servidoresComEstado()
  return disponibilidadeExterna(ferramenta, {
    servidores: () => estadoCache as Promise<ServidorMcp[]>,
    escopo: escopoDe,
    prefixo: prefixoDe,
  })
}

export const SERVIDOR_NAVEGACAO = 'omc'

export const TOOLS_NAVEGACAO: readonly string[] = [
  'lsp_servers',
  'lsp_hover',
  'lsp_goto_definition',
  'lsp_find_references',
  'lsp_document_symbols',
  'lsp_workspace_symbols',
  'lsp_diagnostics',
  'lsp_diagnostics_directory',
  'ast_grep_search',
]

export function ferramentasDeNavegacao(disponibilidade: DisponibilidadeExterna): string[] {
  if (!disponibilidade.usavel) return []
  return disponibilidade.tools.flatMap(prefixo => TOOLS_NAVEGACAO.map(tool => `${prefixo}__${tool}`))
}

export async function navegacaoSemantica(): Promise<string[]> {
  return ferramentasDeNavegacao(await conectorExterno(SERVIDOR_NAVEGACAO))
}
