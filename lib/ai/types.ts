import type { Usage } from '../card'

export type AgentRole = 'implement' | 'verify' | 'gate' | 'step'

export type AiProviderName = 'claude' | 'codex' | 'ollama' | 'kimi'

export type AgentMode = 'edit' | 'readonly'

export interface AgentRequest {
  prompt: string
  cwd: string
  dirs: string[]
  mode: AgentMode
  useAgents: boolean
  model?: string
  effort?: string
  timeoutMs: number
  liveLog?: string
  extraTools?: string[]
}

export interface AgentResult {
  ok: boolean
  failed: boolean
  timedOut: boolean
  isError: boolean
  detail: string
  text: string
  cost: number
  costMeasured: boolean
  usage: Usage
}

export interface ProviderLimits {
  readonly restrictsTools: boolean
  readonly isolatesReadonly: boolean
  readonly acceptsEffort: boolean
  readonly reportsCostUsd: boolean
  readonly reportsTokens: boolean
}

export interface AiProvider {
  readonly name: AiProviderName
  readonly supportsAgents: boolean
  readonly supportsVision: boolean
  readonly agentic: boolean
  readonly limits?: ProviderLimits
  run(req: AgentRequest): Promise<AgentResult>
}
