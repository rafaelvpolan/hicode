import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ensureWorktree, refreshFromBase, removeWorktree, runGit } from '../lib/runner/git'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-git-'))
let seq = 0

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

interface Cenario {
  origem: string
  clone: string
}

function cenario(branch = 'main'): Cenario {
  const n = ++seq
  const origem = join(BASE, `origem-${n}.git`)
  const semente = join(BASE, `semente-${n}`)
  const clone = join(BASE, `clone-${n}`)
  mkdirSync(semente, { recursive: true })
  execFileSync('git', ['init', '-q', '--bare', origem])
  git(semente, ['init', '-q', '.'])
  git(semente, ['config', 'user.email', 't@t'])
  git(semente, ['config', 'user.name', 't'])
  writeFileSync(join(semente, 'a.txt'), 'um\n')
  git(semente, ['add', '-A'])
  git(semente, ['commit', '-qm', 'primeiro'])
  git(semente, ['branch', '-M', branch])
  git(semente, ['remote', 'add', 'origin', origem])
  git(semente, ['push', '-q', '-u', 'origin', branch])
  execFileSync('git', ['--git-dir', origem, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`])
  execFileSync('git', ['clone', '-q', origem, clone])
  git(clone, ['config', 'user.email', 't@t'])
  git(clone, ['config', 'user.name', 't'])
  return { origem, clone }
}

function commitNaOrigem(c: Cenario, arquivo: string, texto: string, branch = 'main'): string {
  const tmp = mkdtempSync(join(BASE, 'push-'))
  execFileSync('git', ['clone', '-q', c.origem, tmp])
  git(tmp, ['config', 'user.email', 't@t'])
  git(tmp, ['config', 'user.name', 't'])
  writeFileSync(join(tmp, arquivo), texto)
  git(tmp, ['add', '-A'])
  git(tmp, ['commit', '-qm', `mudanca em ${arquivo}`])
  git(tmp, ['push', '-q', 'origin', branch])
  return git(tmp, ['rev-parse', 'HEAD'])
}

test('ensureWorktree cria a branch de origin/base e devolve o commit de origem', async () => {
  const c = cenario()
  const wt = join(BASE, 'wt-1')
  const info = await ensureWorktree(c.clone, wt, 'hicode/tarefa', 'main')
  expect(info.path).toBe(wt)
  expect(info.baseCommit).toHaveLength(7)
  expect(git(wt, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('hicode/tarefa')
  await removeWorktree(c.clone, wt)
})

test('REGRESSAO ensureWorktree parte do origin/base ATUALIZADO, nao do que estava em cache', async () => {
  const c = cenario()
  const novoSha = commitNaOrigem(c, 'b.txt', 'dois\n')
  const wt = join(BASE, 'wt-2')
  const info = await ensureWorktree(c.clone, wt, 'hicode/nova', 'main')
  expect(novoSha.startsWith(info.baseCommit)).toBe(true)
  expect(git(wt, ['log', '-1', '--pretty=%s'])).toContain('b.txt')
  await removeWorktree(c.clone, wt)
})

test('REGRESSAO fetch que falha NAO cria branch de estado velho — lanca', async () => {
  const c = cenario()
  git(c.clone, ['remote', 'set-url', 'origin', join(BASE, 'remoto-que-nao-existe.git')])
  await expect(ensureWorktree(c.clone, join(BASE, 'wt-3'), 'hicode/x', 'main')).rejects.toThrow(/fetch origin\/main falhou/)
})

test('base inexistente no remoto diz o que conferir', async () => {
  const c = cenario()
  await expect(ensureWorktree(c.clone, join(BASE, 'wt-4'), 'hicode/y', 'master')).rejects.toThrow(/nao existe no remoto|fetch origin\/master falhou/)
})

test('refreshFromBase: nada a integrar quando ja esta atualizado', async () => {
  const c = cenario()
  const wt = join(BASE, 'wt-5')
  await ensureWorktree(c.clone, wt, 'hicode/z', 'main')
  const r = await refreshFromBase(wt, 'main')
  expect(r.ok).toBe(true)
  expect(r.changed).toBe(false)
  expect(r.detail).toContain('ja atualizado')
  await removeWorktree(c.clone, wt)
})

test('REGRESSAO refreshFromBase integra o que a base andou depois do worktree', async () => {
  const c = cenario()
  const wt = join(BASE, 'wt-6')
  await ensureWorktree(c.clone, wt, 'hicode/w', 'main')
  commitNaOrigem(c, 'c.txt', 'tres\n')
  const r = await refreshFromBase(wt, 'main')
  expect(r.ok).toBe(true)
  expect(r.changed).toBe(true)
  expect(r.detail).toContain('1 commit')
  expect(git(wt, ['log', '--oneline'])).toContain('c.txt')
  await removeWorktree(c.clone, wt)
})

test('refreshFromBase com conflito aborta o merge e devolve erro', async () => {
  const c = cenario()
  const wt = join(BASE, 'wt-7')
  await ensureWorktree(c.clone, wt, 'hicode/conflito', 'main')
  writeFileSync(join(wt, 'a.txt'), 'local\n')
  await runGit(wt, ['add', '-A'])
  await runGit(wt, ['-c', 'commit.gpgsign=false', 'commit', '-m', 'local'])
  commitNaOrigem(c, 'a.txt', 'remoto\n')
  const r = await refreshFromBase(wt, 'main')
  expect(r.ok).toBe(false)
  expect(r.detail).toContain('conflito')
  expect(git(wt, ['status', '--porcelain'])).toBe('')
  await removeWorktree(c.clone, wt)
})

test('refreshFromBase com fetch quebrado nao mente que atualizou', async () => {
  const c = cenario()
  const wt = join(BASE, 'wt-8')
  await ensureWorktree(c.clone, wt, 'hicode/quebrado', 'main')
  await runGit(wt, ['remote', 'set-url', 'origin', join(BASE, 'sumiu.git')])
  const r = await refreshFromBase(wt, 'main')
  expect(r.ok).toBe(false)
  expect(r.detail).toContain('fetch origin/main falhou')
  await removeWorktree(c.clone, wt)
})
