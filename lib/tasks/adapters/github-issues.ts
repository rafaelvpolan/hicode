import { run } from '../../runner/git'
import type { Fields } from '../../card'
import type { ExternalTask, TaskSync } from '../types'

interface GhIssue {
  number?: number
  title?: string
  body?: string
}

export function parseIssues(stdout: string): ExternalTask[] {
  try {
    const arr = JSON.parse(stdout) as GhIssue[]
    if (!Array.isArray(arr)) return []
    return arr.filter(i => i.number != null).map(i => ({ externalId: String(i.number), title: String(i.title ?? ''), body: String(i.body ?? '') }))
  } catch {
    return []
  }
}

function repoArgs(): string[] {
  const repo = process.env.HICODE_GH_REPO || ''
  return repo ? ['--repo', repo] : []
}

export class GithubIssuesSync implements TaskSync {
  readonly name = 'github-issues'

  async pull(): Promise<ExternalTask[]> {
    const { stdout } = await run('gh', ['issue', 'list', '--json', 'number,title,body', '--state', 'open', '--limit', '50', ...repoArgs()], { timeout: 30000 })
    return parseIssues(stdout)
  }

  async push(card: Fields): Promise<void> {
    const num = String(card.source || '').split('#').pop() || ''
    if (!num) return
    const body = `hicode: card #${card.id} → ${card.status}${card.pr_url ? ` · PR ${card.pr_url}` : ''}`
    await run('gh', ['issue', 'comment', num, '--body', body, ...repoArgs()], { timeout: 30000 })
  }
}
