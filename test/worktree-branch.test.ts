import { test, expect } from 'bun:test'
import { worktreePathsForBranch } from '../lib/runner/git'

const PORCELAIN = `worktree /home/u/projects/hicode-site
HEAD abc
branch refs/heads/main

worktree /home/u/projects/.hicode-worktrees/hicode-site/pr8-merge-fix
HEAD def
branch refs/heads/hicode/009-o-site-nao-esta

worktree /home/u/projects/.hicode-worktrees/hicode-site/010-x
HEAD 111
branch refs/heads/hicode/010-x
`

test('acha o worktree que segura a branch alvo', () => {
  expect(worktreePathsForBranch(PORCELAIN, 'hicode/009-o-site-nao-esta'))
    .toEqual(['/home/u/projects/.hicode-worktrees/hicode-site/pr8-merge-fix'])
})

test('branch em nenhum worktree -> vazio', () => {
  expect(worktreePathsForBranch(PORCELAIN, 'hicode/999-nada')).toEqual([])
})

test('nao confunde main com branch de card', () => {
  expect(worktreePathsForBranch(PORCELAIN, 'main')).toEqual(['/home/u/projects/hicode-site'])
})

test('worktree detached (sem linha branch) nao entra', () => {
  const p = `worktree /a\nHEAD abc\ndetached\n`
  expect(worktreePathsForBranch(p, 'main')).toEqual([])
})
