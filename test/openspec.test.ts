import { test, expect } from 'bun:test'
import { parseValidation } from '../lib/spec/openspec'

test('parseValidation: failed=0 -> ok', () => {
  const v = parseValidation(JSON.stringify({ items: [{ name: 'card-1', valid: true, issues: [] }], summary: { totals: { failed: 0, passed: 1 } } }))
  expect(v.ok).toBe(true)
  expect(v.failed).toBe(0)
  expect(v.issues).toEqual([])
})

test('parseValidation: failed>0 -> nao ok, coleta issues', () => {
  const v = parseValidation(JSON.stringify({
    items: [{ name: 'card-1', valid: false, issues: [{ level: 'ERROR', path: 'demo/spec.md', message: 'must contain SHALL or MUST' }] }],
    summary: { totals: { failed: 1, passed: 0 } },
  }))
  expect(v.ok).toBe(false)
  expect(v.failed).toBe(1)
  expect(v.issues[0]).toContain('must contain SHALL or MUST')
})

test('parseValidation: JSON invalido falha fechado (nao aprova)', () => {
  const v = parseValidation('nao json')
  expect(v.ok).toBe(false)
})
