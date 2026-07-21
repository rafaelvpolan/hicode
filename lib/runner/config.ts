import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
export const CARDS_DIR = join(ROOT, 'cards')
export const REPOS_FILE = join(ROOT, 'config', 'repos.json')
export const WT_BASE = join(dirname(ROOT), '.hicode-worktrees')
export const PREVIEW_BASE_PORT = Number(process.env.HICODE_PREVIEW_BASE || 5200)
export const POLL_MS = Number(process.env.HICODE_POLL_MS || 5000)
export const RUN_TIMEOUT_MS = Number(process.env.HICODE_RUN_TIMEOUT_MS || 900000)
export const MAX_CONCURRENCY = Number(process.env.HICODE_CONCURRENCY || 3)
export const MAX_REAJUSTE = Number(process.env.HICODE_REAJUSTE_RETRIES || 2)
export const MAX_CONFLICT = Number(process.env.HICODE_CONFLICT_RETRIES || 2)
export const MERGE_POLL_MS = Number(process.env.HICODE_MERGE_POLL_MS || 30000)
export const VERIFY_MODEL = process.env.HICODE_VERIFY_MODEL || 'sonnet'
export const GATE_MODEL = process.env.HICODE_GATE_MODEL || 'sonnet'
export const GATE_DIFF_LIMIT = Number(process.env.HICODE_GATE_DIFF_LIMIT || 60000)
export const VISUAL_AI = (process.env.HICODE_VISUAL_AI || 'off') === 'on'
