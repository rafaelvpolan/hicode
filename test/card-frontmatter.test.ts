import { test, expect } from 'bun:test'
import { splitFrontMatter, serializeCard, extractObjetivo } from '../lib/card'

test('splitFrontMatter le frontmatter e corpo', () => {
  const p = splitFrontMatter('---\nid: 001\nstatus: READY\n---\n\n## Objetivo\nfazer X\n')
  expect(p.fm.id).toBe('001')
  expect(p.fm.status).toBe('READY')
  expect(p.body).toContain('## Objetivo')
})

test('serializeCard preserva ordem das chaves', () => {
  const out = serializeCard({ id: '2', status: 'READY' }, ['id', 'status'], 'corpo')
  expect(out.indexOf('id: 2')).toBeLessThan(out.indexOf('status: READY'))
})

test('extractObjetivo pega o bloco de Objetivo', () => {
  expect(extractObjetivo('## Objetivo\nmeu alvo\n\n## Outro\nx')).toBe('meu alvo')
})
