import type { Usage } from '../card'

export function emptyUsage(): Usage {
  return { tokens_in: 0, tokens_out: 0, tokens_cache_create: 0, tokens_cache_read: 0 }
}

export function sumTokens(u: Usage): number {
  return u.tokens_in + u.tokens_out + u.tokens_cache_create
}
