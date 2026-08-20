export type AgentRole = 'implement' | 'verify' | 'gate' | 'step'

export type AiProviderName = 'claude' | 'codex' | 'ollama' | 'kimi'

export const ESFORCOS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Esforco = (typeof ESFORCOS)[number]

export interface PreferenciaDePapel {
  provider?: string
  model?: string
  effort?: string
}

export type PreferenciasDeIa = Partial<Record<AgentRole, PreferenciaDePapel>>
