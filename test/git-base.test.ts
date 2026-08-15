import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ensureWorktree, pushOwnedBranch, refreshFromBase, removeWorktree, runGit, settleWorktree } from '../lib/runner/git'

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

test('pushOwnedBranch: branch nova no remoto — push normal, sem force', async () => {
  const c = cenario()
  const wt = join(BASE, 'wt-push-1')
  await ensureWorktree(c.clone, wt, 'hicode/nova-branch', 'main')
  writeFileSync(join(wt, 'novo.txt'), 'conteudo\n')
  git(wt, ['add', '-A'])
  git(wt, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'feat: novo'])
  const r = await pushOwnedBranch(wt, 'hicode/nova-branch', '')
  expect(r.ok).toBe(true)
  expect(r.forced).toBe(false)
  expect(r.pushedSha).toHaveLength(40)
  await removeWorktree(c.clone, wt)
})

function branchExisteNoRemoto(origem: string, branch: string): boolean {
  try {
    return execFileSync('git', ['ls-remote', '--heads', origem, branch], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().length > 0
  } catch {
    return false
  }
}

function pushTentativaAnterior(c: Cenario, branch: string, arquivo: string, texto: string): string {
  const tentativa = mkdtempSync(join(BASE, 'tentativa-'))
  execFileSync('git', ['clone', '-q', c.origem, tentativa])
  git(tentativa, ['config', 'user.email', 't@t'])
  git(tentativa, ['config', 'user.name', 't'])
  if (branchExisteNoRemoto(c.origem, branch)) git(tentativa, ['checkout', '-qb', branch, `origin/${branch}`])
  else git(tentativa, ['checkout', '-qb', branch])
  writeFileSync(join(tentativa, arquivo), texto)
  git(tentativa, ['add', '-A'])
  git(tentativa, ['-c', 'commit.gpgsign=false', 'commit', '-qm', `commit em ${arquivo}`])
  git(tentativa, ['push', '-q', 'origin', branch])
  return git(tentativa, ['rev-parse', 'HEAD'])
}

test('REGRESSAO pushOwnedBranch: com a ancora do push anterior DESTE card, force-with-lease sobrescreve com seguranca', async () => {
  const c = cenario()
  const branch = 'hicode/022-retry'
  const shaAnterior = pushTentativaAnterior(c, branch, 'orfa.txt', 'tentativa anterior\n')

  const wt = join(BASE, 'wt-push-2')
  await ensureWorktree(c.clone, wt, branch, 'main')
  writeFileSync(join(wt, 'novo.txt'), 'trabalho atual, aprovado no preview\n')
  git(wt, ['add', '-A'])
  git(wt, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'feat: trabalho atual'])

  const r = await pushOwnedBranch(wt, branch, shaAnterior)
  expect(r.ok).toBe(true)
  expect(r.forced).toBe(true)
  expect(r.pushedSha).toHaveLength(40)

  const checkout = join(BASE, 'check-remoto')
  execFileSync('git', ['clone', '-q', '--branch', branch, c.origem, checkout])
  expect(existsSync(join(checkout, 'novo.txt'))).toBe(true)
  expect(existsSync(join(checkout, 'orfa.txt'))).toBe(false)
  await removeWorktree(c.clone, wt)
})

test('REGRESSAO pushOwnedBranch: SEM ancora conhecida, nao-fast-forward NAO forca — conteudo remoto desconhecido fica intacto', async () => {
  const c = cenario()
  const branch = 'hicode/desconhecida'
  pushTentativaAnterior(c, branch, 'orfa.txt', 'conteudo de outro processo/card\n')

  const wt = join(BASE, 'wt-push-sem-ancora')
  await ensureWorktree(c.clone, wt, branch, 'main')
  writeFileSync(join(wt, 'novo.txt'), 'trabalho atual\n')
  git(wt, ['add', '-A'])
  git(wt, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'feat: trabalho atual'])

  const r = await pushOwnedBranch(wt, branch, '')
  expect(r.ok).toBe(false)
  expect(r.forced).toBe(false)
  expect(r.failureReason).toBe('no-anchor')

  const checkout = join(BASE, 'check-remoto-sem-ancora')
  execFileSync('git', ['clone', '-q', '--branch', branch, c.origem, checkout])
  expect(existsSync(join(checkout, 'orfa.txt'))).toBe(true)
  expect(existsSync(join(checkout, 'novo.txt'))).toBe(false)
  await removeWorktree(c.clone, wt)
})

test('REGRESSAO pushOwnedBranch: ancora DESATUALIZADA (branch mudou depois do ultimo push conhecido) NAO forca por cima', async () => {
  const c = cenario()
  const branch = 'hicode/022-retry-divergiu'
  const shaConhecidoPeloCard = pushTentativaAnterior(c, branch, 'v1.txt', 'versao que o card conhece\n')
  pushTentativaAnterior(c, branch, 'v2-humano.txt', 'fixup humano depois do ultimo push do motor\n')

  const wt = join(BASE, 'wt-push-divergiu')
  await ensureWorktree(c.clone, wt, branch, 'main')
  writeFileSync(join(wt, 'novo.txt'), 'trabalho atual\n')
  git(wt, ['add', '-A'])
  git(wt, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'feat: trabalho atual'])

  const r = await pushOwnedBranch(wt, branch, shaConhecidoPeloCard)
  expect(r.ok).toBe(false)
  expect(r.forced).toBe(true)
  expect(r.failureReason).toBe('diverged')

  const checkout = join(BASE, 'check-remoto-divergiu')
  execFileSync('git', ['clone', '-q', '--branch', branch, c.origem, checkout])
  expect(existsSync(join(checkout, 'v2-humano.txt'))).toBe(true)
  expect(existsSync(join(checkout, 'novo.txt'))).toBe(false)
  await removeWorktree(c.clone, wt)
})

test('settleWorktree com fate discard remove o worktree', async () => {
  const c = cenario()
  const wt = join(BASE, 'wt-settle-discard')
  await ensureWorktree(c.clone, wt, 'hicode/settle-discard', 'main')
  expect(existsSync(wt)).toBe(true)
  await settleWorktree(c.clone, wt, 'discard')
  expect(existsSync(wt)).toBe(false)
})

test('settleWorktree com fate keep-for-inspection mantem o worktree intacto', async () => {
  const c = cenario()
  const wt = join(BASE, 'wt-settle-keep')
  await ensureWorktree(c.clone, wt, 'hicode/settle-keep', 'main')
  await settleWorktree(c.clone, wt, 'keep-for-inspection')
  expect(existsSync(wt)).toBe(true)
  expect(git(wt, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('hicode/settle-keep')
  await removeWorktree(c.clone, wt)
})

test('pushOwnedBranch: falha que nao e non-fast-forward NAO tenta --force-with-lease', async () => {
  const c = cenario()
  const wt = join(BASE, 'wt-push-3')
  await ensureWorktree(c.clone, wt, 'hicode/sem-remoto', 'main')
  await runGit(wt, ['remote', 'set-url', 'origin', join(BASE, 'nao-existe.git')])
  const r = await pushOwnedBranch(wt, 'hicode/sem-remoto', '')
  expect(r.ok).toBe(false)
  expect(r.forced).toBe(false)
  expect(r.failureReason).toBe('other')
  await removeWorktree(c.clone, wt)
})

test('REGRESSAO card 022: PR aberto prova posse da branch e o push resolve sozinho', async () => {
  const c = cenario()
  const branch = 'hicode/022-com-pr-aberto'
  pushTentativaAnterior(c, branch, 'tentativa-anterior.txt', 'commit da propria tarefa, de um ciclo antes\n')

  const wt = join(BASE, 'wt-push-dono-comprovado')
  await ensureWorktree(c.clone, wt, branch, 'main')
  writeFileSync(join(wt, 'agora.txt'), 'trabalho desta reexecucao\n')
  git(wt, ['add', '-A'])
  git(wt, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'feat: reexecucao'])

  const r = await pushOwnedBranch(wt, branch, '', true)
  expect(r.ok).toBe(true)
  expect(r.forced).toBe(true)
  expect(r.pushedSha).not.toBe('')

  const checkout = join(BASE, 'check-dono-comprovado')
  execFileSync('git', ['clone', '-q', '--branch', branch, c.origem, checkout])
  expect(existsSync(join(checkout, 'agora.txt'))).toBe(true)
  await removeWorktree(c.clone, wt)
})

test('sem posse comprovada, o comportamento seguro continua valendo: nao forca', async () => {
  const c = cenario()
  const branch = 'hicode/sem-posse'
  pushTentativaAnterior(c, branch, 'de-outro.txt', 'conteudo de outro processo\n')

  const wt = join(BASE, 'wt-push-sem-posse')
  await ensureWorktree(c.clone, wt, branch, 'main')
  writeFileSync(join(wt, 'meu.txt'), 'meu trabalho\n')
  git(wt, ['add', '-A'])
  git(wt, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'feat: meu'])

  const r = await pushOwnedBranch(wt, branch, '', false)
  expect(r.ok).toBe(false)
  expect(r.failureReason).toBe('no-anchor')

  const checkout = join(BASE, 'check-sem-posse')
  execFileSync('git', ['clone', '-q', '--branch', branch, c.origem, checkout])
  expect(existsSync(join(checkout, 'de-outro.txt'))).toBe(true)
  expect(existsSync(join(checkout, 'meu.txt'))).toBe(false)
  await removeWorktree(c.clone, wt)
})
