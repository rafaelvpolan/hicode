import { test, expect } from 'bun:test'
import {
  lerLinhaDeServidor, lerListaDeServidores, lerEscopo, combinam, disponibilidadeExterna,
} from '../lib/ai/mcp-estado'
import type { ConsultaMcp, ServidorMcp } from '../lib/ai/mcp-estado'

const LISTA = [
  'Checking MCP server health…',
  '',
  'claude.ai Slack: https://mcp.slack.com/mcp - ✔ Connected',
  'claude.ai Linear: https://mcp.linear.app/mcp - ! Needs authentication',
  'plugin:Notion:notion: https://mcp.notion.com/mcp (HTTP) - ✔ Connected',
].join('\n')

const consulta = (servidores: ServidorMcp[], escopos: Record<string, 'dinamico' | 'persistente'> = {}): ConsultaMcp => ({
  servidores: async () => servidores,
  escopo: async (nome) => escopos[nome] ?? 'persistente',
  prefixo: (nome) => `mcp__${nome.replace(/[^a-zA-Z0-9]+/g, '_')}`,
})

test('le o estado de cada servidor, nao so o nome', () => {
  const s = lerListaDeServidores(LISTA)
  expect(s).toHaveLength(3)
  expect(s.find(x => x.nome === 'claude.ai Slack')?.estado).toBe('conectado')
  expect(s.find(x => x.nome === 'claude.ai Linear')?.estado).toBe('precisa-auth')
})

test('linha de cabecalho e linha vazia nao viram servidor', () => {
  expect(lerLinhaDeServidor('Checking MCP server health…')).toBeNull()
  expect(lerLinhaDeServidor('')).toBeNull()
})

test('escopo dinamico e reconhecido — nao chega no subprocesso do motor', () => {
  expect(lerEscopo('plugin:Notion:notion:\n  Scope: Dynamic config (from command line)\n  Status: ✔ Connected')).toBe('dinamico')
  expect(lerEscopo('x:\n  Scope: User config\n  Status: ✔ Connected')).toBe('persistente')
})

test('combinam ignora acento e caixa', () => {
  expect(combinam('notion', 'plugin:Notion:notion')).toBe(true)
  expect(combinam('slack', 'claude.ai Slack')).toBe(true)
  expect(combinam('notion', 'claude.ai Slack')).toBe(false)
})

test('REGRESSAO: conectado mas de escopo dinamico NAO e usavel — era falso positivo', async () => {
  const r = await disponibilidadeExterna('notion',
    consulta([{ nome: 'plugin:Notion:notion', estado: 'conectado' }], { 'plugin:Notion:notion': 'dinamico' }))
  expect(r.usavel).toBe(false)
  expect(r.motivo).toContain('sessao interativa')
  expect(r.tools).toEqual([])
})

test('precisa-auth NAO e usavel, e o motivo diz que o motor nao roda OAuth', async () => {
  const r = await disponibilidadeExterna('linear', consulta([{ nome: 'claude.ai Linear', estado: 'precisa-auth' }]))
  expect(r.usavel).toBe(false)
  expect(r.motivo).toContain('OAuth')
})

test('conectado e persistente e usavel, com o prefixo certo', async () => {
  const r = await disponibilidadeExterna('slack', consulta([{ nome: 'claude.ai Slack', estado: 'conectado' }]))
  expect(r.usavel).toBe(true)
  expect(r.tools).toEqual(['mcp__claude_ai_Slack'])
})

test('servidor ausente da lista e reportado como ausente, nao como sem permissao', async () => {
  const r = await disponibilidadeExterna('trello', consulta([{ nome: 'claude.ai Slack', estado: 'conectado' }]))
  expect(r.usavel).toBe(false)
  expect(r.motivo).toContain('nenhum servidor MCP')
})

test('estado desconhecido nao passa por conectado', async () => {
  const r = await disponibilidadeExterna('box', consulta([{ nome: 'claude.ai Box', estado: 'desconhecido' }]))
  expect(r.usavel).toBe(false)
})
