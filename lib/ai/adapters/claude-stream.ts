import { spawn } from 'node:child_process'
import { appendFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { emptyUsage } from '../usage'
import type { AgentRequest, AgentResult } from '../types'
import type { Usage } from '../../card'

const NONINTERACTIVE_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_EDITOR: 'true',
  GIT_SEQUENCE_EDITOR: 'true',
  GIT_PAGER: 'cat',
  PAGER: 'cat',
}

interface StreamPart {
  type: string
  text?: string
  name?: string
  input?: object
  content?: string | object
}

interface StreamEvent {
  type?: string
  subtype?: string
  model?: string
  message?: { content?: StreamPart[] }
  total_cost_usd?: number
  result?: string
  is_error?: boolean
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }
}

function usageFrom(u: StreamEvent['usage']): Usage {
  return {
    tokens_in: u?.input_tokens || 0,
    tokens_out: u?.output_tokens || 0,
    tokens_cache_create: u?.cache_creation_input_tokens || 0,
    tokens_cache_read: u?.cache_read_input_tokens || 0,
  }
}

function short(v: object | string | undefined): string {
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    return s.length > 100 ? s.slice(0, 100) + '…' : s
  } catch {
    return ''
  }
}

function renderEvent(ev: StreamEvent): string {
  if (ev.type === 'system' && ev.subtype === 'init') return `— sessao iniciada${ev.model ? ' (' + ev.model + ')' : ''} —`
  if (ev.type === 'assistant' && ev.message?.content) {
    const parts: string[] = []
    for (const c of ev.message.content) {
      if (c.type === 'text' && c.text) parts.push(c.text.trim())
      else if (c.type === 'tool_use') parts.push(`  → ${c.name || 'tool'}(${short(c.input)})`)
    }
    return parts.filter(Boolean).join('\n')
  }
  if (ev.type === 'user' && ev.message?.content) {
    for (const c of ev.message.content) {
      if (c.type === 'tool_result') return `  ← ${short(c.content).replace(/\s+/g, ' ')}`
    }
  }
  if (ev.type === 'result') return `— concluido (custo $${(Number(ev.total_cost_usd) || 0).toFixed(4)}) —`
  return ''
}

function argvStream(req: AgentRequest, tools: string): string[] {
  const a = ['-p', req.prompt, '--output-format', 'stream-json', '--verbose']
  if (req.model) a.push('--model', req.model)
  if (req.mode === 'edit') a.push('--permission-mode', 'acceptEdits', '--allowedTools', tools)
  else a.push('--allowedTools', tools)
  for (const d of req.dirs) a.push('--add-dir', d)
  return a
}

export function runClaudeStream(req: AgentRequest, tools: string, liveLog: string): Promise<AgentResult> {
  const dir = dirname(liveLog)
  if (!existsSync(dir)) { try { mkdirSync(dir, { recursive: true }) } catch { void 0 } }
  try { writeFileSync(liveLog, '') } catch { void 0 }
  const write = (s: string): void => { try { appendFileSync(liveLog, s) } catch { void 0 } }

  return new Promise<AgentResult>((resolve) => {
    let text = ''
    let assistantText = ''
    let cost = 0
    let isError = false
    let usage = emptyUsage()
    let gotResult = false
    let buf = ''
    let settled = false
    let timedOut = false
    let hard: ReturnType<typeof setTimeout> | null = null

    const child = spawn('claude', argvStream(req, tools), { cwd: req.cwd, env: { ...process.env, ...NONINTERACTIVE_ENV }, stdio: ['ignore', 'pipe', 'pipe'] })

    const soft = setTimeout(() => {
      timedOut = true
      write('\n— TIMEOUT: encerrando a IA —\n')
      try { child.kill('SIGTERM') } catch { void 0 }
      hard = setTimeout(() => { try { child.kill('SIGKILL') } catch { void 0 } }, 5000)
    }, req.timeoutMs)

    const done = (failed: boolean, detail = ''): void => {
      if (settled) return
      settled = true
      clearTimeout(soft)
      if (hard) clearTimeout(hard)
      resolve({ ok: !failed && !isError, failed, timedOut, isError, detail, text: text || assistantText, cost, usage })
    }

    const handleLine = (line: string): void => {
      if (!line.trim()) return
      try {
        const ev = JSON.parse(line) as StreamEvent
        const human = renderEvent(ev)
        if (human) write(human + '\n')
        if (ev.type === 'assistant' && ev.message?.content) {
          for (const c of ev.message.content) if (c.type === 'text' && c.text) assistantText = c.text
        }
        if (ev.type === 'result') {
          gotResult = true
          cost = Number(ev.total_cost_usd) || 0
          text = String(ev.result ?? '')
          isError = !!ev.is_error
          usage = usageFrom(ev.usage)
        }
      } catch {
        write(line + '\n')
      }
    }

    child.stdout.on('data', (d: Buffer) => {
      buf += String(d)
      let i = buf.indexOf('\n')
      while (i >= 0) {
        handleLine(buf.slice(0, i))
        buf = buf.slice(i + 1)
        i = buf.indexOf('\n')
      }
    })

    child.stderr.on('data', (d: Buffer) => write(String(d)))
    child.on('error', (e: Error) => done(true, String(e?.message || e)))
    child.on('close', (code: number | null) => {
      if (buf.trim()) handleLine(buf)
      if (!gotResult && code) isError = true
      done(timedOut || !gotResult, timedOut ? 'timeout' : code ? `exit ${code}` : '')
    })
  })
}
