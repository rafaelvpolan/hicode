import { run } from '../../runner/git'
import { emptyUsage } from '../usage'
import type { AgentMode, AgentRequest, AgentResult, AiProvider, AiProviderName } from '../types'
import type { Usage } from '../../card'

interface CodexEvent {
  type?: string
  item?: { type?: string; text?: string }
  usage?: { input_tokens?: number; output_tokens?: number; cached_input_tokens?: number }
}

function sandbox(mode: AgentMode): string {
  return mode === 'edit' ? 'workspace-write' : 'read-only'
}

function argv(req: AgentRequest, workdir: string): string[] {
  const a = ['exec', req.prompt, '-C', workdir, '--sandbox', sandbox(req.mode), '-a', 'never', '--json']
  if (req.model) a.push('-m', req.model)
  for (const d of req.dirs.slice(1)) a.push('--add-dir', d)
  return a
}

function parse(stdout: string): { text: string; usage: Usage; isError: boolean } {
  let text = ''
  let isError = false
  const usage = emptyUsage()
  for (const line of stdout.split('\n')) {
    const t = line.trim()
    if (!t || t[0] !== '{') continue
    let ev: CodexEvent
    try { ev = JSON.parse(t) as CodexEvent } catch { continue }
    if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) {
      text = ev.item.text
    } else if (ev.type === 'turn.completed' && ev.usage) {
      usage.tokens_in = ev.usage.input_tokens || 0
      usage.tokens_out = ev.usage.output_tokens || 0
      usage.tokens_cache_read = ev.usage.cached_input_tokens || 0
    } else if (ev.type === 'error' || ev.type === 'turn.failed') {
      isError = true
    }
  }
  return { text, usage, isError }
}

export class CodexProvider implements AiProvider {
  readonly name: AiProviderName = 'codex'
  readonly supportsAgents = false
  readonly supportsVision = false
  readonly agentic = true

  async run(req: AgentRequest): Promise<AgentResult> {
    const workdir = req.dirs[0] ?? req.cwd
    const { err, stdout, stderr } = await run('codex', argv(req, workdir), { cwd: workdir, timeout: req.timeoutMs })
    const parsed = parse(stdout)
    const failed = !!err
    return {
      ok: !failed && !parsed.isError,
      failed,
      timedOut: !!err?.killed,
      isError: parsed.isError,
      detail: err ? String(err.message || '') : '',
      text: parsed.text || String(stdout || stderr || ''),
      cost: 0,
      usage: parsed.usage,
    }
  }
}
