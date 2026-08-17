import { GATE_MODEL, VERIFY_MODEL } from '../runner/config'
import { ClaudeProvider } from './adapters/claude'
import { CodexProvider } from './adapters/codex'
import { OllamaProvider } from './adapters/ollama'
import type { AgentRole, AiProvider, AiProviderName } from './types'
import { preferenciaDoPapel, esforcoPara } from './preferencias'

export const DEFAULT_PROVIDER: AiProviderName = 'claude'

const PROVIDERS: Record<AiProviderName, AiProvider> = {
  claude: new ClaudeProvider(),
  codex: new CodexProvider(),
  ollama: new OllamaProvider(),
}

const ROLE_PROVIDER_ENV: Record<AgentRole, string> = {
  implement: 'HICODE_IMPLEMENT_PROVIDER',
  verify: 'HICODE_VERIFY_PROVIDER',
  gate: 'HICODE_GATE_PROVIDER',
  step: 'HICODE_STEP_PROVIDER',
}

const PROVIDER_MODEL_ENV: Record<Exclude<AiProviderName, 'claude'>, string> = {
  codex: 'HICODE_CODEX_MODEL',
  ollama: 'HICODE_OLLAMA_MODEL',
}

export function isProviderName(s: string | undefined): s is AiProviderName {
  return s !== undefined && Object.prototype.hasOwnProperty.call(PROVIDERS, s)
}

export function providerNames(): AiProviderName[] {
  return Object.keys(PROVIDERS) as AiProviderName[]
}

export function agentRoles(): AgentRole[] {
  return Object.keys(ROLE_PROVIDER_ENV) as AgentRole[]
}

export function roleProviderEnv(role: AgentRole): string {
  return ROLE_PROVIDER_ENV[role]
}

export function roleQuotaFallbackEnv(role: AgentRole): string {
  return `HICODE_${role.toUpperCase()}_QUOTA_FALLBACK_PROVIDER`
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

export function providerFor(role: AgentRole, override?: string): AiProvider {
  return PROVIDERS[providerNameFor(role, override)]
}

export function modelFor(role: AgentRole, override?: string): string | undefined {
  const name = providerNameFor(role, override)
  const escolhido = preferenciaDoPapel(role).model
  if (escolhido) return escolhido
  if (name === 'claude') {
    if (role === 'verify') return VERIFY_MODEL
    if (role === 'gate') return GATE_MODEL
    return undefined
  }
  return process.env[PROVIDER_MODEL_ENV[name]] || undefined
}

export function effortFor(role: AgentRole, doCard?: string): string | undefined {
  return esforcoPara(role, doCard)
}

export function quotaFallbackProviderFor(role: AgentRole): AiProviderName | null {
  const env = process.env[roleQuotaFallbackEnv(role)]
  return isProviderName(env) ? env : null
}
