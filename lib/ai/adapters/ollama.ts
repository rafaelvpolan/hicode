import { run } from '../../runner/git'
import { isPrivateNetworkHost } from '../../runner/private-net'
import { noProxyArgs } from '../../runner/loopback'
import { emptyUsage } from '../usage'
import { COST_FREE_LOCAL, COST_UNKNOWN } from '../cost'
import type { CostReading } from '../cost'
import type { AgentRequest, AgentResult, AiProvider, AiProviderName } from '../types'

interface OllamaResponse {
  response?: string
  error?: string
  prompt_eval_count?: number
  eval_count?: number
}

function baseUrl(): string {
  return process.env.HICODE_OLLAMA_URL || 'http://localhost:11434'
}

function endpointRodaNaRedeLocal(): boolean {
  try {
    return isPrivateNetworkHost(new URL(baseUrl()).hostname)
  } catch {
    return false
  }
}

function costOfEndpoint(): CostReading {
  return endpointRodaNaRedeLocal() ? COST_FREE_LOCAL : COST_UNKNOWN
}

export class OllamaProvider implements AiProvider {
  readonly name: AiProviderName = 'ollama'
  readonly supportsAgents = false
  readonly supportsVision = false
  readonly agentic = false

  async run(req: AgentRequest): Promise<AgentResult> {
    const model = req.model || process.env.HICODE_OLLAMA_MODEL || 'llama3.1'
    const body = JSON.stringify({ model, prompt: req.prompt, stream: false })
    const endpoint = `${baseUrl()}/api/generate`
    const args = ['-q', ...noProxyArgs(endpoint), '-s', '-H', 'Content-Type: application/json', endpoint, '-d', body]
    const { err, stdout, stderr } = await run('curl', args, { cwd: req.cwd, timeout: req.timeoutMs })
    const usage = emptyUsage()
    let text = ''
    let isError = false
    try {
      const j = JSON.parse(stdout) as OllamaResponse
      text = String(j.response ?? '')
      usage.tokens_in = j.prompt_eval_count || 0
      usage.tokens_out = j.eval_count || 0
      if (j.error) isError = true
    } catch {
      text = String(stdout || stderr || '')
    }
    const failed = !!err
    return {
      ok: !failed && !isError,
      failed,
      timedOut: !!err?.killed,
      isError,
      detail: err ? String(err.message || '') : '',
      text,
      ...costOfEndpoint(),
      usage,
    }
  }
}
