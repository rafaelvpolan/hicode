import { run } from '../../runner/git'
import { emptyUsage } from '../usage'
import type { AgentRequest, AgentResult, AiProvider, AiProviderName } from '../types'
import type { Usage } from '../../card'

interface OpencodeEvent {
  type?: string
  text?: string
  part?: { text?: string }
  cost?: number
  tokens?: { input?: number; output?: number; cache?: { read?: number; write?: number } }
}

function argv(req: AgentRequest, workdir: string): string[] {
  const a = ['run', req.prompt, '--dir', workdir, '--format', 'json']
  if (req.mode === 'edit') a.push('--auto')
  if (req.model) a.push('--model', req.model)
  return a
}

function parse(stdout: string): { text: string; usage: Usage; cost: number; isError: boolean } {
  let text = ''
  let cost = 0
  let isError = false
  const usage = emptyUsage()
  for (const line of stdout.split('\n')) {
    const t = line.trim()
    if (!t || t[0] !== '{') continue
    let ev: OpencodeEvent
    try { ev = JSON.parse(t) as OpencodeEvent } catch { continue }
    if (ev.type === 'text') {
      text += ev.text ?? ev.part?.text ?? ''
    } else if (ev.type === 'step_finish') {
      cost = ev.cost || 0
      const tk = ev.tokens ?? {}
      usage.tokens_in = tk.input || 0
      usage.tokens_out = tk.output || 0
      usage.tokens_cache_read = tk.cache?.read || 0
      usage.tokens_cache_create = tk.cache?.write || 0
    } else if (ev.type === 'error') {
      isError = true
    }
  }
  return { text, usage, cost, isError }
}

export class OpencodeProvider implements AiProvider {
  readonly name: AiProviderName = 'opencode'
  readonly supportsAgents = false
  readonly supportsVision = false
  readonly agentic = true

  async run(req: AgentRequest): Promise<AgentResult> {
    const workdir = req.dirs[0] ?? req.cwd
    const { err, stdout, stderr } = await run('opencode', argv(req, workdir), { cwd: workdir, timeout: req.timeoutMs })
    const parsed = parse(stdout)
    const failed = !!err
    return {
      ok: !failed && !parsed.isError,
      failed,
      timedOut: !!err?.killed,
      isError: parsed.isError,
      detail: err ? String(err.message || '') : '',
      text: parsed.text || String(stdout || stderr || ''),
      cost: parsed.cost,
      usage: parsed.usage,
    }
  }
}
