import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { StatusDeServico } from '#shared/types'
import { agentRoles, modelFor, providerNameFor, providerNames } from '../ia'
import type { AgentRole, AiProviderName } from '../ia/tipos'
import { estadoDeServico } from './executar'

const TIMEOUT_HTTP_MS = 5000

const BINARIO: Record<AiProviderName, string> = { claude: 'claude', codex: 'codex', kimi: 'kimi', ollama: 'ollama' }
const URL_DE_SAUDE: Partial<Record<AiProviderName, string>> = { claude: 'https://api.anthropic.com', codex: 'https://api.openai.com' }

function ollamaUrl(): string {
  return process.env.HICODE_OLLAMA_URL || 'http://localhost:11434'
}

function noPath(binario: string): boolean {
  const caminhos = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  return caminhos.some(dir => existsSync(join(dir, binario)))
}

async function alcancavel(url: string): Promise<boolean> {
  const controlador = new AbortController()
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_HTTP_MS)
  try {
    const resposta = await fetch(url, { signal: controlador.signal })
    return resposta.status > 0 && resposta.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function comoObter(nome: AiProviderName): string {
  if (nome === 'claude') return 'instale o CLI do Claude Code'
  if (nome === 'codex') return 'instale o CLI do Codex'
  if (nome === 'ollama') return `suba o ollama (${ollamaUrl()})`
  return 'instale o CLI do Kimi Code'
}

function papeisPorProvedor(): Map<AiProviderName, AgentRole[]> {
  const mapa = new Map<AiProviderName, AgentRole[]>()
  for (const papel of agentRoles()) {
    const nome = providerNameFor(papel)
    mapa.set(nome, [...(mapa.get(nome) ?? []), papel])
  }
  return mapa
}

function urlDeSaudeDe(nome: AiProviderName): string | undefined {
  return nome === 'ollama' ? `${ollamaUrl()}/api/tags` : URL_DE_SAUDE[nome]
}

async function sondarProvedor(nome: AiProviderName, papeis: AgentRole[]): Promise<StatusDeServico> {
  const rotulo = `IA: ${nome}`
  if (!noPath(BINARIO[nome])) {
    return estadoDeServico(rotulo, 'erro', 'binario ausente no PATH', comoObter(nome))
  }
  const urlDeSaude = urlDeSaudeDe(nome)
  const saudavel = urlDeSaude ? await alcancavel(urlDeSaude) : true
  const modelo = papeis[0] ? (modelFor(papeis[0]) ?? '') : ''
  const papeisTexto = papeis.length ? `papeis: ${papeis.join(', ')}` : 'sem papel atribuido'
  if (!saudavel) {
    return estadoDeServico(
      rotulo,
      'atencao',
      `instalado, mas nao respondeu em ${urlDeSaude}`,
      nome === 'ollama' ? `confira se o ollama esta no ar em ${ollamaUrl()}` : 'confira conectividade de rede',
    )
  }
  return estadoDeServico(rotulo, 'ok', modelo ? `${papeisTexto} — modelo ${modelo}` : papeisTexto)
}

export async function sondarProvedoresIa(): Promise<StatusDeServico[]> {
  const mapa = papeisPorProvedor()
  return Promise.all(providerNames().map(nome => sondarProvedor(nome, mapa.get(nome) ?? [])))
}
