export const STATUSES = [
  'INBOX', 'READY', 'SPECCED', 'PLAN_APPROVED', 'EXECUTING', 'PAUSED', 'EXECUTED',
  'PREVIEW', 'CORRECTING', 'PREVIEW_OK', 'REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED',
  'CLEANED', 'PR_OPEN', 'MERGED', 'DEPLOYED', 'HALTED',
] as const

export type Status = (typeof STATUSES)[number]

export type Risk = 'low' | 'high'

export type Fields = Record<string, string>

export interface Parsed {
  fm: Fields
  order: string[]
  body: string
}

export interface Card extends Parsed {
  file: string
}

export interface Repo {
  name: string
  url: string
  branch: string
  runCmd: string
  added: string
}

export interface Usage {
  tokens_in: number
  tokens_out: number
  tokens_cache_create: number
  tokens_cache_read: number
}

export interface StepMetric {
  time: number
  cost: number
  tokens: number
}

export type StepMap = Record<string, StepMetric>

export interface Run {
  id: string
  ts: string
  ok: boolean
  cost_usd: string
  duration_s: number
  tokens_in: number
  tokens_out: number
  tokens_cache_create: number
  tokens_cache_read: number
  tokens_total: number
  steps: StepMap | null
}

export interface VerifyResult {
  ok: boolean
  reason: string
  cost: number
  tokens: number
}

export interface ImplementResult {
  ok: boolean
  resultText?: string
  reason?: string
  cost: string
  usage?: Usage
}

export type JobKind = 'execute' | 'finish' | 'correct'

export interface Job {
  kind: JobKind
  id: string
}
