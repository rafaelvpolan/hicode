import { isoNow } from '../card'
import { run } from './git'
import { cardsByStatus, patchCard } from './card-store'
import { MERGE_POLL_MS } from './config'

interface PrState {
  state?: string
  mergedAt?: string | null
}

let lastCheck = 0
let checking = false

export async function checkMerged(now: number): Promise<void> {
  if (checking || now - lastCheck < MERGE_POLL_MS) return
  checking = true
  lastCheck = now
  try {
    for (const c of cardsByStatus('PR_OPEN')) {
      const url = c.pr_url
      if (!url) continue
      const { err, stdout } = await run('gh', ['pr', 'view', url, '--json', 'state,mergedAt'], { timeout: 20000 })
      if (err) continue
      let pr: PrState = {}
      try { pr = JSON.parse(stdout) as PrState } catch { continue }
      if (pr.state === 'MERGED') {
        patchCard(c.id ?? '', { status: 'MERGED', merged_at: pr.mergedAt || isoNow() }, `${isoNow()} PR_OPEN->MERGED PR mergeada no GitHub (merge humano) ${url}`)
        process.stdout.write(`[runner] #${c.id}: MERGED ${url}\n`)
      } else if (pr.state === 'CLOSED') {
        patchCard(c.id ?? '', {}, `${isoNow()} PR ${url} fechada sem merge (rejeitada no GitHub) — card mantido em PR_OPEN`)
      }
    }
  } finally {
    checking = false
  }
}
