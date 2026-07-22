import type { Usage } from '../card'

export type AgentRole = 'implement' | 'verify' | 'gate' | 'step'

export type AiProviderName = 'claude' | 'codex' | 'opencode' | 'ollama'

export type AgentMode = 'edit' | 'readonly'

export interface AgentRequest {
  prompt: string
  cwd: string
  dirs: string[]
  mode: AgentMode
  useAgents: boolean
  model?: string
  timeoutMs: number
  liveLog?: string
}

export interface AgentResult {
  ok: boolean
  failed: boolean
  timedOut: boolean
  isError: boolean
  detail: string
  text: string
  cost: number
  usage: Usage
}

export interface AiProvider {
  readonly name: AiProviderName
  readonly supportsAgents: boolean
  readonly supportsVision: boolean
  readonly agentic: boolean
  run(req: AgentRequest): Promise<AgentResult>
}
