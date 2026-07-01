import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CardStatus, CardView, StateResponse } from '#shared/types'
import { CARDS_DIR, readCards, STATUSES } from './card-io'
import { readRepos } from './repos'

export function getState(): StateResponse {
  const cards: CardView[] = readCards().map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title || c.slug,
    status: (c.status || 'INBOX') as CardStatus,
    risk: c.risk === 'high' ? 'high' : 'low',
    repo: c.repo || '',
    updated: c.updated || '',
    desc: c.desc || '',
    cost_usd: c.cost_usd || '',
    tokens_total: c.tokens_total || '',
    verify: c.verify || '',
    revalidacao: c.revalidacao || '',
    preview_url: c.preview_url || '',
    pr_url: c.pr_url || '',
    shot: existsSync(join(CARDS_DIR, 'previews', String(c.id), 'preview.png')),
  }))
  return { repos: readRepos(), cards, statuses: STATUSES }
}
