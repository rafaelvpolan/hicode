import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { providerNames, providerNameFor, modelFor, agentRoles } from './registry'
import { preferenciaDoPapel } from './preferencias'
import type { AgentRole, AiProviderName } from './types'

const BINARIO: Partial<Record<AiProviderName, string>> = {
  claude: 'claude',
  codex: 'codex',
  kimi: 'kimi',
  ollama: 'ollama',
}

export type Situacao = 'disponivel' | 'ausente' | 'precisa-servidor'

export interface ProvedorDisponivel {
  nome: AiProviderName
  situacao: Situacao
  instalado: boolean
  comoObter: string
  modelo: string
  papeis: AgentRole[]
}

function noPath(binario: string): boolean {
  const caminhos = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  return caminhos.some(dir => existsSync(join(dir, binario)))
}

function comoObter(nome: AiProviderName): string {
  if (nome === 'claude') return 'instale o CLI do Claude Code'
  if (nome === 'codex') return 'instale o CLI do Codex'
  if (nome === 'ollama') return `suba o ollama (${process.env.HICODE_OLLAMA_URL || 'http://localhost:11434'})`
  if (nome === 'kimi') return 'instale o CLI do Kimi Code'
  return ''
}

export function provedoresDisponiveis(): ProvedorDisponivel[] {
  const papeisPorProvedor = new Map<string, AgentRole[]>()
  for (const papel of agentRoles()) {
    const p = providerNameFor(papel)
    papeisPorProvedor.set(p, [...(papeisPorProvedor.get(p) ?? []), papel])
  }
  return providerNames().map((nome): ProvedorDisponivel => {
    const bin = BINARIO[nome]
    const papeis = papeisPorProvedor.get(nome) ?? []
    const modeloDoPapel = papeis[0] ? modelFor(papeis[0]) : undefined
    const modeloEscolhido = papeis[0] ? preferenciaDoPapel(papeis[0]).model : undefined
    const situacao: Situacao = bin
      ? (noPath(bin) ? 'disponivel' : 'ausente')
      : 'precisa-servidor'
    return {
      nome,
      situacao,
      instalado: situacao !== 'ausente',
      comoObter: comoObter(nome),
      modelo: modeloEscolhido || modeloDoPapel || '',
      papeis,
    }
  })
}

export function provedoresUsaveis(): AiProviderName[] {
  return provedoresDisponiveis().filter(p => p.instalado).map(p => p.nome)
}
