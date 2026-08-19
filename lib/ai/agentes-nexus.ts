import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../runner/config'
import { ENV_AGENTS_DIR } from '../runner/environment-contract'
import { memoTempo } from '../core/cache'

export interface AgenteInjetado {
  description: string
  prompt: string
  model?: string
  tools?: string
}

const TTL_MS = 30_000

export function diretorioDosAgentes(): string {
  return process.env[ENV_AGENTS_DIR] || join(ROOT, '.claude', 'agents')
}

function semAspas(valor: string): string {
  const t = valor.trim()
  if (t.length > 1 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
    return t.slice(1, -1)
  }
  return t
}

export interface AgenteLido {
  nome: string
  agente: AgenteInjetado
}

export function lerAgente(texto: string): AgenteLido | null {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return null
  const campos = new Map<string, string>()
  for (const linha of (m[1] ?? '').split('\n')) {
    const i = linha.indexOf(':')
    if (i <= 0) continue
    campos.set(linha.slice(0, i).trim(), semAspas(linha.slice(i + 1)))
  }
  const nome = campos.get('name') ?? ''
  const description = campos.get('description') ?? ''
  const prompt = (m[2] ?? '').trim()
  if (!nome || !description || !prompt) return null
  const agente: AgenteInjetado = { description, prompt }
  const model = campos.get('model')
  const tools = campos.get('tools')
  if (model) agente.model = model
  if (tools) agente.tools = tools
  return { nome, agente }
}

function lerDoDisco(): Record<string, AgenteInjetado> {
  const dir = diretorioDosAgentes()
  if (!existsSync(dir)) return {}
  const out: Record<string, AgenteInjetado> = {}
  for (const arquivo of readdirSync(dir)) {
    if (!arquivo.endsWith('.md')) continue
    try {
      const lido = lerAgente(readFileSync(join(dir, arquivo), 'utf8'))
      if (lido) out[lido.nome] = lido.agente
    } catch {
      continue
    }
  }
  return out
}

const memorizado = memoTempo(lerDoDisco, TTL_MS)

export function agentesNexus(): Record<string, AgenteInjetado> {
  return memorizado()
}

export function agentesNexusJson(): string {
  const agentes = agentesNexus()
  return Object.keys(agentes).length ? JSON.stringify(agentes) : ''
}

function comFerramentasExtra(agente: AgenteInjetado, extras: readonly string[]): AgenteInjetado {
  if (!extras.length || !agente.tools) return agente
  const declaradas = agente.tools.split(',').map(t => t.trim()).filter(t => t.length > 0)
  return { ...agente, tools: Array.from(new Set([...declaradas, ...extras])).join(', ') }
}

export function agentesNexusPor(nomes: readonly string[], ferramentasExtra: readonly string[] = []): Record<string, AgenteInjetado> {
  const todos = agentesNexus()
  const escolhidos: Record<string, AgenteInjetado> = {}
  for (const nome of nomes) {
    const agente = todos[nome]
    if (agente) escolhidos[nome] = comFerramentasExtra(agente, ferramentasExtra)
  }
  return escolhidos
}

export function agentesNexusJsonPor(nomes: readonly string[], ferramentasExtra: readonly string[] = []): string {
  const escolhidos = agentesNexusPor(nomes, ferramentasExtra)
  return Object.keys(escolhidos).length ? JSON.stringify(escolhidos) : ''
}
