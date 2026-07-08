import { GithubIssuesSync } from './adapters/github-issues'
import type { TaskSync } from './types'

const SYNCS: Record<string, TaskSync> = {
  'github-issues': new GithubIssuesSync(),
}

export function taskSyncName(): string {
  return process.env.HICODE_TASK_SYNC || 'none'
}

export function taskSync(): TaskSync | null {
  return SYNCS[taskSyncName()] ?? null
}

export function taskSyncNames(): string[] {
  return ['none', ...Object.keys(SYNCS)]
}
