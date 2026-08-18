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

const EDIT_TOOLS_AGENTS = 'Task,Read,Edit,Write,Glob,Grep,Bash'
const EDIT_TOOLS = 'Read,Edit,Write,Glob,Grep,Bash'
const READONLY_TOOLS = 'Read,Glob,Grep'

function baseToolsFor(req: AgentRequest): string {
  if (req.mode !== 'edit') return READONLY_TOOLS
  return req.useAgents ? EDIT_TOOLS_AGENTS : EDIT_TOOLS
}

function toolsFor(req: AgentRequest): string {
  const base = baseToolsFor(req).split(',')
  const extra = req.extraTools ?? []
  return Array.from(new Set([...base, ...extra])).join(',')
}

function argv(req: AgentRequest): string[] {
  const a = ['-p', req.prompt, '--output-format', 'json']
  if (req.model) a.push('--model', req.model)
  if (req.effort) a.push('--effort', req.effort)
  if (req.mode === 'edit') a.push('--permission-mode', 'acceptEdits', '--allowedTools', toolsFor(req))
  else a.push('--allowedTools', toolsFor(req))
  for (const d of req.dirs) a.push('--add-dir', d)
  return a
}

export class ClaudeProvider implements AiProvider {
  readonly name: AiProviderName = 'claude'
  readonly supportsAgents = true
  readonly supportsVision = true
  readonly agentic = true

  async run(req: AgentRequest): Promise<AgentResult> {
    if (req.liveLog) return runClaudeStream(req, toolsFor(req), req.liveLog)
    const { err, stdout, stderr } = await run('claude', argv(req), { cwd: req.cwd, timeout: req.timeoutMs })
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
