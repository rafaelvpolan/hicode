import type { FailureClass } from '../card'
import type { AiProviderName } from './types'

export interface FailureContext {
  timedOut: boolean
  detail: string
  text: string
}

export interface FailureClassification {
  failureClass: FailureClass
  reason: string
}

interface Signal {
  pattern: RegExp
  reason: string
}

interface ProviderSignals {
  terminal: Signal[]
  quota: Signal[]
  transient: Signal[]
}

const TERMINAL_GENERIC: Signal[] = [
  { pattern: /enoent|command not found|no such file or directory/i, reason: 'provedor nao instalado (binario nao encontrado)' },
  { pattern: /invalid[_ -]?api[_ -]?key|unauthorized|authentication[_ -]?error|please run\s*\/?login|\b401\b|\b403\b|forbidden/i, reason: 'credencial invalida' },
  { pattern: /invalid[_ -]?request[_ -]?error|malformed|\b400\b|unsupported (model|parameter)/i, reason: 'requisicao malformada' },
]

const QUOTA_GENERIC: Signal[] = [
  { pattern: /insufficient[_ ]?quota|exceeded your current quota|quota exceeded|usage limit reached|your limit will reset|credit balance (is )?too low|billing hard limit|plan limit reached|monthly limit reached/i, reason: 'cota do provedor esgotada' },
]

const TRANSIENT_GENERIC: Signal[] = [
  { pattern: /econnreset|econnrefused|enotfound|eai_again|etimedout|epipe|enetunreach|ehostunreach/i, reason: 'rede indisponivel' },
  { pattern: /socket hang up|network error|fetch failed|dns lookup failed|connection reset/i, reason: 'rede indisponivel' },
  { pattern: /\b(500|502|503|504)\b|bad gateway|service unavailable|gateway timeout|internal server error/i, reason: '5xx do provedor' },
  { pattern: /\b429\b|too many requests|rate.?limit(ed| exceeded)?/i, reason: 'limite de taxa (429)' },
  { pattern: /overloaded|temporarily unavailable|try again later|please retry|server is busy/i, reason: 'provedor temporariamente indisponivel' },
]

const EMPTY_SIGNALS: ProviderSignals = { terminal: [], quota: [], transient: [] }

const PROVIDER_SIGNALS: Record<AiProviderName, ProviderSignals> = {
  claude: {
    terminal: [],
    quota: [{ pattern: /claude ai usage limit reached|5-hour limit reached|weekly limit reached/i, reason: 'limite de uso da assinatura Claude atingido' }],
    transient: [{ pattern: /overloaded_error|\bapi_error\b/i, reason: 'erro transitorio da API Anthropic' }],
  },
  codex: {
    terminal: [],
    quota: [{ pattern: /insufficient_quota|exceeded_quota/i, reason: 'cota da API OpenAI esgotada' }],
    transient: [{ pattern: /rate_limit_exceeded/i, reason: 'limite de taxa da API OpenAI' }],
  },
  opencode: EMPTY_SIGNALS,
  ollama: {
    terminal: [{ pattern: /model not found|no such model/i, reason: 'modelo ollama nao encontrado localmente' }],
    quota: [],
    transient: [{ pattern: /connection refused/i, reason: 'ollama nao esta respondendo (servidor local fora do ar)' }],
  },
}

function firstMatch(haystack: string, signals: Signal[]): Signal | undefined {
  return signals.find(s => s.pattern.test(haystack))
}

export function classifyFailure(provider: AiProviderName, ctx: FailureContext): FailureClassification {
  if (ctx.timedOut) return { failureClass: 'transient', reason: 'timeout — provedor nao respondeu a tempo' }
  const haystack = `${ctx.detail}\n${ctx.text}`.slice(0, 4000)
  const table = PROVIDER_SIGNALS[provider]
  const terminal = firstMatch(haystack, table.terminal) ?? firstMatch(haystack, TERMINAL_GENERIC)
  if (terminal) return { failureClass: 'terminal', reason: terminal.reason }
  const quota = firstMatch(haystack, table.quota) ?? firstMatch(haystack, QUOTA_GENERIC)
  if (quota) return { failureClass: 'quota', reason: quota.reason }
  const transient = firstMatch(haystack, table.transient) ?? firstMatch(haystack, TRANSIENT_GENERIC)
  if (transient) return { failureClass: 'transient', reason: transient.reason }
  return { failureClass: 'terminal', reason: 'falha nao reconhecida — tratada como terminal (mais barato parar que repetir para sempre)' }
}
