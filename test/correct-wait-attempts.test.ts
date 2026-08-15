import { test, expect, afterAll, mock } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ImplementResult } from '../lib/card'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-correctwait-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
mkdirSync(process.env.HICODE_CARDS_DIR, { recursive: true })

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

const origem = join(BASE, 'origem.git')
const semente = join(BASE, 'semente')
const wt = join(BASE, 'wt')
mkdirSync(semente, { recursive: true })
execFileSync('git', ['init', '-q', '--bare', origem])
git(semente, ['init', '-q', '.'])
git(semente, ['config', 'user.email', 't@t'])
git(semente, ['config', 'user.name', 't'])
writeFileSync(join(semente, 'a.txt'), 'um\n')
git(semente, ['add', '-A'])
git(semente, ['commit', '-qm', 'primeiro'])
git(semente, ['branch', '-M', 'main'])
git(semente, ['remote', 'add', 'origin', origem])
git(semente, ['push', '-q', '-u', 'origin', 'main'])
execFileSync('git', ['--git-dir', origem, 'symbolic-ref', 'HEAD', 'refs/heads/main'])
execFileSync('git', ['clone', '-q', origem, wt])
git(wt, ['config', 'user.email', 't@t'])
git(wt, ['config', 'user.name', 't'])

process.env.HICODE_REPOS_FILE = join(BASE, 'repos.json')
writeFileSync(process.env.HICODE_REPOS_FILE, JSON.stringify([{ name: 'org/repo', path: wt, branch: 'main' }]))

const SUCESSO: ImplementResult = { ok: true, resultText: 'refeito', fullText: 'refeito', cost: '0.0500', usage: { tokens_in: 10, tokens_out: 10, tokens_cache_create: 0, tokens_cache_read: 0 } }

const realAgent = await import('../lib/runner/agent')
mock.module('../lib/runner/agent', () => ({
  ...realAgent,
  implement: (): Promise<ImplementResult> => Promise.resolve(SUCESSO),
}))

const { createCard, readCard } = await import('../lib/runner/card-store')
const { handleCorrect } = await import('../lib/runner/correct')

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

test('REGRESSAO: correcao bem-sucedida limpa wait_attempts residual de um incidente ja recuperado', async () => {
  const id = createCard({
    title: 'algo rejeitado',
    status: 'CORRECTING',
    repo: 'org/repo',
    surface: 'visual',
    worktree: wt,
    correction: 'refaca isso',
    wait_attempts: '3',
  }, '## Objetivo\nalgo\n')

  await handleCorrect(id)
  const c = readCard(id)
  expect(c?.fm.status).toBe('PREVIEW')
  expect(c?.fm.wait_attempts).toBe('')
})
