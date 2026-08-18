import { agentsArgv, claudeArgv, toolsFor } from './claude-argv'
export { agentsArgv, claudeArgv, toolsFor } from './claude-argv'
import { run } from '../../runner/git'
import { emptyUsage } from '../usage'
import { COST_UNKNOWN, readReportedCost } from '../cost'
import { runClaudeStream } from './claude-stream'
import type { CostReading } from '../cost'
import type { AgentRequest, AgentResult, AiProvider, AiProviderName } from '../types'

interface ClaudeJson {
  total_cost_usd?: number
  result?: string
  is_error?: boolean
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}


export class ClaudeProvider implements AiProvider {
  readonly name: AiProviderName = 'claude'
  readonly supportsAgents = true
  readonly supportsVision = true
  readonly agentic = true

  async run(req: AgentRequest): Promise<AgentResult> {
    if (req.liveLog) return runClaudeStream(req, req.liveLog)
    const { err, stdout, stderr } = await run('claude', claudeArgv(req), { cwd: req.cwd, timeout: req.timeoutMs })
    let reading: CostReading = COST_UNKNOWN
    let text = ''
    let isError = false
    let usage = emptyUsage()
    try {
      const j = JSON.parse(stdout) as ClaudeJson
      reading = readReportedCost(j.total_cost_usd)
      text = String(j.result ?? '')
      isError = !!j.is_error
      const u = j.usage ?? {}
      usage = {
        tokens_in: u.input_tokens || 0,
        tokens_out: u.output_tokens || 0,
        tokens_cache_create: u.cache_creation_input_tokens || 0,
        tokens_cache_read: u.cache_read_input_tokens || 0,
      }
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
      ...reading,
      usage,
    }
  }
}
