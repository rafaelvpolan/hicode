import { test, expect, afterAll, mock } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { GateResult } from '../lib/runner/codefox-gate'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-finishwait-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
mkdirSync(process.env.HICODE_CARDS_DIR, { recursive: true })

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

const origem = join(BASE, 'origem.git')
const semente = join(BASE, 'semente')
const clone = join(BASE, 'clone')
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
execFileSync('git', ['clone', '-q', origem, clone])
git(clone, ['config', 'user.email', 't@t'])
git(clone, ['config', 'user.name', 't'])

process.env.HICODE_REPOS_FILE = join(BASE, 'repos.json')
writeFileSync(process.env.HICODE_REPOS_FILE, JSON.stringify([{ name: 'org/repo', path: clone, branch: 'main' }]))

const GATE_APROVADO: GateResult = { ok: true, verdict: 'APPROVED', reason: 'sem defeito real encontrado', questions: [], cost: 0.01, tokens: 100 }

const realCodefoxGate = await import('../lib/runner/codefox-gate')
mock.module('../lib/runner/codefox-gate', () => ({
  ...realCodefoxGate,
  runCodefoxGate: (): Promise<GateResult> => Promise.resolve(GATE_APROVADO),
}))

const realAgent = await import('../lib/runner/agent')
mock.module('../lib/runner/agent', () => ({
  ...realAgent,
  runStep: (): never => { throw new Error('nao deveria chamar runStep — steps: nada nao roda nenhum passo') },
}))

const PR_FALSO = 'https://github.com/org/repo/pull/998'

const ghBinDir = join(BASE, 'bin-fake-gh')
mkdirSync(ghBinDir, { recursive: true })
const ghFalso = join(ghBinDir, 'gh')
writeFileSync(ghFalso, `#!/usr/bin/env bash\nif [ "$1" = "pr" ] && [ "$2" = "create" ]; then\n  echo "${PR_FALSO}"\n  exit 0\nfi\necho "gh-falso: comando nao suportado: $*" >&2\nexit 1\n`)
chmodSync(ghFalso, 0o755)
const pathOriginal = process.env.PATH ?? ''
process.env.PATH = `${ghBinDir}:${pathOriginal}`

const realGit = await import('../lib/runner/git')

const { createCard, readCard } = await import('../lib/runner/card-store')
const { handleFinish } = await import('../lib/runner/finish')

afterAll(() => {
  process.env.PATH = pathOriginal
  rmSync(BASE, { recursive: true, force: true })
})

function commitar(wt: string, arquivo: string, texto: string, mensagem: string): void {
  writeFileSync(join(wt, arquivo), texto)
  git(wt, ['add', '-A'])
  git(wt, ['-c', 'commit.gpgsign=false', 'commit', '-qm', mensagem])
}

test('REGRESSAO: finish bem-sucedido (PR_OPEN) limpa wait_attempts residual de um incidente ja recuperado', async () => {
  const wt = join(BASE, 'wt')
  const id = createCard({
    title: 'ajuste apos incidente ja recuperado',
    status: 'PREVIEW_OK',
    repo: 'org/repo',
    surface: 'none',
    clarified: 'true',
    steps: 'nada',
    slug: 'residuo',
    worktree: wt,
    wait_attempts: '5',
  }, '## Objetivo\nfazer algo\n')
  const branch = `hicode/${id}-residuo`

  await realGit.ensureWorktree(clone, wt, branch, 'main')
  commitar(wt, 'mudanca.txt', 'conteudo\n', 'feat: mudanca')

  await handleFinish(id)
  const c = readCard(id)
  expect(c?.fm.status).toBe('PR_OPEN')
  expect(c?.fm.pr_url).toBe(PR_FALSO)
  expect(c?.fm.wait_attempts).toBe('')
  expect(existsSync(wt)).toBe(false)
})
