import { GATE_MODEL, VERIFY_MODEL } from '../runner/config'
import { ClaudeProvider } from './adapters/claude'
import { CodexProvider } from './adapters/codex'
import { OpencodeProvider } from './adapters/opencode'
import { OllamaProvider } from './adapters/ollama'
import type { AgentRole, AiProvider, AiProviderName } from './types'

const PROVIDERS: Record<AiProviderName, AiProvider> = {
  claude: new ClaudeProvider(),
  codex: new CodexProvider(),
  opencode: new OpencodeProvider(),
  ollama: new OllamaProvider(),
}

const ROLE_PROVIDER_ENV: Record<AgentRole, string> = {
  implement: 'HICODE_IMPLEMENT_PROVIDER',
  verify: 'HICODE_VERIFY_PROVIDER',
  gate: 'HICODE_GATE_PROVIDER',
  step: 'HICODE_STEP_PROVIDER',
}

function isProviderName(s: string | undefined): s is AiProviderName {
  return s !== undefined && Object.prototype.hasOwnProperty.call(PROVIDERS, s)
}

export function providerNames(): AiProviderName[] {
  return Object.keys(PROVIDERS) as AiProviderName[]
}

export function providerNameFor(role: AgentRole, override?: string): AiProviderName {
  if (isProviderName(override)) return override
  const perRole = process.env[ROLE_PROVIDER_ENV[role]]
  if (isProviderName(perRole)) return perRole
  const dflt = process.env.HICODE_AI_PROVIDER
  return isProviderName(dflt) ? dflt : 'claude'
}

export function providerFor(role: AgentRole, override?: string): AiProvider {
  return PROVIDERS[providerNameFor(role, override)]
}

export function modelFor(role: AgentRole, override?: string): string | undefined {
  const name = providerNameFor(role, override)
  if (name === 'claude') {
    if (role === 'verify') return VERIFY_MODEL
    if (role === 'gate') return GATE_MODEL
    return undefined
  }
  if (name === 'codex') return process.env.HICODE_CODEX_MODEL || undefined
  if (name === 'ollama') return process.env.HICODE_OLLAMA_MODEL || undefined
  return process.env.HICODE_OPENCODE_MODEL || undefined
}

export function quotaFallbackProviderFor(role: AgentRole): AiProviderName | null {
  const env = process.env[`HICODE_${role.toUpperCase()}_QUOTA_FALLBACK_PROVIDER`]
  return isProviderName(env) ? env : null
}
