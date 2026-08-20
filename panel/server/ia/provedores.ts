import type { AgentRole, AiProviderName } from './tipos'
import { preferenciaDoPapel, esforcoPara } from './preferencias'

export const DEFAULT_PROVIDER: AiProviderName = 'claude'

const PROVIDER_NAMES: readonly AiProviderName[] = ['claude', 'codex', 'ollama', 'kimi']

const ROLE_PROVIDER_ENV: Record<AgentRole, string> = {
  implement: 'HICODE_IMPLEMENT_PROVIDER',
  verify: 'HICODE_VERIFY_PROVIDER',
  gate: 'HICODE_GATE_PROVIDER',
  step: 'HICODE_STEP_PROVIDER',
}

const PROVIDER_MODEL_ENV: Record<Exclude<AiProviderName, 'claude'>, string> = {
  codex: 'HICODE_CODEX_MODEL',
  ollama: 'HICODE_OLLAMA_MODEL',
  kimi: 'HICODE_KIMI_MODEL',
}

export function isProviderName(s: string | undefined): s is AiProviderName {
  return s !== undefined && (PROVIDER_NAMES as readonly string[]).includes(s)
}

export function providerNames(): AiProviderName[] {
  return [...PROVIDER_NAMES]
}

export function agentRoles(): AgentRole[] {
  return Object.keys(ROLE_PROVIDER_ENV) as AgentRole[]
}

export function providerNameFor(role: AgentRole, override?: string): AiProviderName {
  if (isProviderName(override)) return override
  const escolhido = preferenciaDoPapel(role).provider
  if (isProviderName(escolhido)) return escolhido
  const perRole = process.env[ROLE_PROVIDER_ENV[role]]
  if (isProviderName(perRole)) return perRole
  const dflt = process.env.HICODE_AI_PROVIDER
  return isProviderName(dflt) ? dflt : DEFAULT_PROVIDER
}

export function modelFor(role: AgentRole, override?: string): string | undefined {
  const name = providerNameFor(role, override)
  const escolhido = preferenciaDoPapel(role).model
  if (escolhido) return escolhido
  if (name === 'claude') {
    if (role === 'verify') return process.env.HICODE_VERIFY_MODEL || 'sonnet'
    if (role === 'gate') return process.env.HICODE_GATE_MODEL || 'sonnet'
    return undefined
  }
  return process.env[PROVIDER_MODEL_ENV[name]] || undefined
}

export function effortFor(role: AgentRole, doCard?: string): string | undefined {
  return esforcoPara(role, doCard)
}
