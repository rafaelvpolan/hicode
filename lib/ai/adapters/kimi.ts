import { appendFileSync } from 'node:fs'
import { run } from '../../runner/git'
import { emptyUsage } from '../usage'
import { COST_UNKNOWN } from '../cost'
import type { AgentRequest, AgentResult, AiProvider, AiProviderName, ProviderLimits } from '../types'

interface KimiStreamLine {
  role?: string
  type?: string
  content?: string
  error_name?: string
  error_message?: string
  status_code?: number
}

interface KimiStreamRead {
  text: string
  retryDetail: string
  erroFatal: string
  eventos: number
}

const OUTPUT_FORMAT = 'stream-json'

export const KIMI_LIMITS: ProviderLimits = {
  restrictsTools: false,
  isolatesReadonly: false,
  acceptsEffort: false,
  reportsCostUsd: false,
  reportsTokens: false,
}

export function kimiArgv(req: AgentRequest): string[] {
  const a = ['-p', req.prompt, '--output-format', OUTPUT_FORMAT]
  if (req.mode === 'edit') a.push('--auto')
  if (req.model) a.push('-m', req.model)
  for (const d of req.dirs) a.push('--add-dir', d)
  return a
}

function retryDetailOf(ev: KimiStreamLine): string {
  const status = typeof ev.status_code === 'number' ? `HTTP ${ev.status_code}` : ''
  return [ev.error_name ?? '', ev.error_message ?? '', status].filter(s => s.length > 0).join(' ')
}

function readStream(stdout: string): KimiStreamRead {
  let text = ''
  let retryDetail = ''
  let erroFatal = ''
  let eventos = 0
  for (const raw of stdout.split('\n')) {
    const linha = raw.trim()
    if (!linha || linha[0] !== '{') continue
    let ev: KimiStreamLine
    try { ev = JSON.parse(linha) as KimiStreamLine } catch { continue }
    eventos += 1
    if (ev.role === 'assistant' && typeof ev.content === 'string' && ev.content.length > 0) text = ev.content
    else if (ev.role === 'meta' && ev.type === 'turn.step.retrying') retryDetail = retryDetailOf(ev)
    else if (ev.error_name || ev.error_message) erroFatal = retryDetailOf(ev)
  }
  return { text, retryDetail, erroFatal, eventos }
}

function semResposta(lido: KimiStreamRead): boolean {
  return !lido.text && lido.eventos > 0
}

function failureDetail(message: string, retryDetail: string): string {
  return [message, retryDetail].filter(s => s.length > 0).join(' | ')
}

function gravarLiveLog(caminho: string, stdout: string): void {
  const linhas: string[] = []
  for (const raw of stdout.split('\n')) {
    const linha = raw.trim()
    if (!linha || linha[0] !== '{') continue
    let ev: KimiStreamLine
    try { ev = JSON.parse(linha) as KimiStreamLine } catch { continue }
    if (ev.role === 'assistant' && typeof ev.content === 'string' && ev.content.length > 0) linhas.push(ev.content)
    else if (ev.role === 'meta' && ev.type) linhas.push(`  \u2192 ${ev.type}(${retryDetailOf(ev)})`)
  }
  if (linhas.length) appendFileSync(caminho, linhas.join('\n') + '\n')
}

export class KimiProvider implements AiProvider {
  readonly name: AiProviderName = 'kimi'
  readonly supportsAgents = true
  readonly supportsVision = false
  readonly agentic = true
  readonly limits: ProviderLimits = KIMI_LIMITS

  async run(req: AgentRequest): Promise<AgentResult> {
    const { err, stdout, stderr } = await run('kimi', kimiArgv(req), { cwd: req.cwd, timeout: req.timeoutMs })
    const lido = readStream(stdout)
    if (req.liveLog) gravarLiveLog(req.liveLog, stdout)
    const erroDeStream = !!lido.erroFatal || semResposta(lido)
    const failed = !!err || erroDeStream
    return {
      ok: !failed,
      failed,
      timedOut: !!err?.killed,
      isError: erroDeStream,
      detail: failed
        ? failureDetail(String(err?.message || lido.erroFatal || 'kimi terminou sem resposta do assistente'), lido.retryDetail)
        : '',
      text: lido.text || String(stdout || stderr || ''),
      ...COST_UNKNOWN,
      usage: emptyUsage(),
    }
  }
}
