import { join, dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ENV_CARDS_DIR, ENV_REPOS_FILE, ENV_ROOT } from './environment-contract'

const MARCADORES = ['runner.ts', 'cards', join('config', 'repos.json'), join('bin', 'repl.ts')]

function hasRepoMarkers(dir: string): boolean {
  return MARCADORES.some(m => existsSync(join(dir, m)))
}

function resolveRoot(): string {
  if (process.env[ENV_ROOT]) return process.env[ENV_ROOT]
  const fromModule = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
  if (hasRepoMarkers(fromModule)) return fromModule
  for (const c of [process.cwd(), resolve(process.cwd(), '..')]) {
    if (hasRepoMarkers(c)) return c
  }
  return fromModule
}

export const ROOT = resolveRoot()
export function cardsDir(): string {
  return process.env[ENV_CARDS_DIR] || join(ROOT, 'cards')
}

export function reposFile(): string {
  return process.env[ENV_REPOS_FILE] || join(ROOT, 'config', 'repos.json')
}
export function numeroDeEnv(nome: string, padrao: number): number {
  const bruto = process.env[nome]
  if (bruto === undefined || bruto === '') return padrao
  const n = Number(bruto)
  if (!Number.isFinite(n) || n < 0) {
    process.stderr.write(`[hicode] ${nome}="${bruto}" nao e numero valido — usando ${padrao}\n`)
    return padrao
  }
  return n
}

export const WT_BASE = join(dirname(ROOT), '.hicode-worktrees')
export const PREVIEW_BASE_PORT = numeroDeEnv('HICODE_PREVIEW_BASE', 5200)
export const POLL_MS = numeroDeEnv('HICODE_POLL_MS', 5000)
export const RUN_TIMEOUT_MS = numeroDeEnv('HICODE_RUN_TIMEOUT_MS', 900000)
export const MAX_CONCURRENCY = numeroDeEnv('HICODE_CONCURRENCY', 3)
export function maxReajuste(): number {
  return numeroDeEnv('HICODE_REAJUSTE_RETRIES', 2)
}
export const MAX_CONFLICT = numeroDeEnv('HICODE_CONFLICT_RETRIES', 2)
export const GATE_RETRIES = numeroDeEnv('HICODE_GATE_RETRIES', 1)
export const MERGE_POLL_MS = numeroDeEnv('HICODE_MERGE_POLL_MS', 30000)
export const VERIFY_MODEL = process.env.HICODE_VERIFY_MODEL || 'sonnet'
export const GATE_MODEL = process.env.HICODE_GATE_MODEL || 'sonnet'
export const GATE_DIFF_LIMIT = numeroDeEnv('HICODE_GATE_DIFF_LIMIT', 60000)
export const GATE_TIMEOUT_MIN_MS = numeroDeEnv('HICODE_GATE_TIMEOUT_MIN_MS', 180000)
export const GATE_TIMEOUT_MAX_MS = numeroDeEnv('HICODE_GATE_TIMEOUT_MAX_MS', 600000)
export const GATE_TIMEOUT_MS_PER_KB = numeroDeEnv('HICODE_GATE_TIMEOUT_MS_PER_KB', 4000)
export const VISUAL_AI = (process.env.HICODE_VISUAL_AI || 'off') === 'on'
export const CLARIFY = (process.env.HICODE_CLARIFY || 'on') !== 'off'
export const CARD_BUDGET_USD = numeroDeEnv('HICODE_CARD_BUDGET_USD', 0)
export const EVAL = (process.env.HICODE_EVAL || 'on') !== 'off'
export const PROJECT_MEMORY = (process.env.HICODE_PROJECT_MEMORY || 'on') !== 'off'
export function maxWaitingAttempts(): number {
  return numeroDeEnv('HICODE_WAITING_MAX_ATTEMPTS', 8)
}
export function quotaFallbackLigado(): boolean {
  return (process.env.HICODE_QUOTA_FALLBACK || 'off') === 'on'
}
