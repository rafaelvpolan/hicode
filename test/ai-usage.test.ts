import { test, expect } from 'bun:test'
import { emptyUsage, sumTokens } from '../lib/ai/usage'

test('emptyUsage zera tudo', () => {
  expect(emptyUsage()).toEqual({ tokens_in: 0, tokens_out: 0, tokens_cache_create: 0, tokens_cache_read: 0 })
})

test('sumTokens soma in+out+cache_create e ignora cache_read', () => {
  expect(sumTokens({ tokens_in: 10, tokens_out: 5, tokens_cache_create: 3, tokens_cache_read: 100 })).toBe(18)
})
