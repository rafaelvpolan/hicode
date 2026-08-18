import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { join, basename } from 'node:path'
import { execFile, type ExecFileException, type ExecFileOptions } from 'node:child_process'
import { WT_BASE } from './config'

export interface RunResult {
  err: ExecFileException | null
  stdout: string
  stderr: string
}

const NONINTERACTIVE_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_EDITOR: 'true',
  GIT_SEQUENCE_EDITOR: 'true',
  GIT_PAGER: 'cat',
  PAGER: 'cat',
}

export function run(cmd: string, args: string[], opts?: ExecFileOptions): Promise<RunResult> {
  const timeoutMs = Number(opts?.timeout) || 0
  return new Promise((resolve) => {
    let settled = false
    let timedOut = false
    let hard: ReturnType<typeof setTimeout> | null = null
    const child = execFile(cmd, args, {
      maxBuffer: 1 << 24,
      ...opts,
      timeout: 0,
      env: { ...process.env, ...NONINTERACTIVE_ENV, ...(opts?.env ?? {}) },
    }, (err, stdout, stderr) => {
      if (settled) return
      settled = true
      if (soft) clearTimeout(soft)
      if (hard) clearTimeout(hard)
      let e = err as ExecFileException | null
      if (timedOut) e = Object.assign(e ?? new Error(`timeout apos ${timeoutMs}ms`), { killed: true })
      resolve({ err: e, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
    const soft = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true
      try { child.kill('SIGTERM') } catch { void 0 }
      hard = setTimeout(() => { try { child.kill('SIGKILL') } catch { void 0 } }, 5000)
      hard.unref?.()
    }, timeoutMs) : null
  })
}

export function runGit(dir: string, args: string[]): Promise<RunResult> {
  return run('git', args, { cwd: dir, timeout: 120000 })
}

export function stageAll(wt: string): Promise<RunResult> {
  return runGit(wt, ['add', '-A', '--', '.', ':!node_modules'])
}

export function worktreePath(target: string, id: string, slug: string): string {
  return join(WT_BASE, basename(target), `${id}-${slug}`)
}

let gitChain: Promise<void> = Promise.resolve()

export function withGitLock<T>(fn: () => Promise<T>): Promise<T> {
  const p = gitChain.then(fn, fn) as Promise<T>
  gitChain = p.then(() => undefined, () => undefined)
  return p
}

export function worktreePathsForBranch(porcelain: string, branch: string): string[] {
  const out: string[] = []
  let cur = ''
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) cur = line.slice(9).trim()
    else if (line === `branch refs/heads/${branch}` && cur) out.push(cur)
  }
  return out
}

async function worktreesHoldingBranch(target: string, branch: string): Promise<string[]> {
  const r = await runGit(target, ['worktree', 'list', '--porcelain'])
  return worktreePathsForBranch(String(r.stdout || ''), branch)
}

export interface WorktreeInfo {
  path: string
  baseCommit: string
}

export interface RefreshResult {
  ok: boolean
  changed: boolean
  detail: string
}

export async function refreshFromBase(wt: string, base: string): Promise<RefreshResult> {
  const f = await withGitLock(() => runGit(wt, ['fetch', 'origin', base]))
  if (f.err) return { ok: false, changed: false, detail: `fetch origin/${base} falhou: ${String(f.stderr || '').slice(0, 120)}` }
  const contagem = await runGit(wt, ['rev-list', '--count', `HEAD..origin/${base}`])
  if (contagem.err) {
    return { ok: false, changed: false, detail: `nao consegui comparar com origin/${base}: ${String(contagem.stderr || '').split('\n')[0] ?? ''}` }
  }
  const atras = Number(contagem.stdout.trim())
  if (!Number.isFinite(atras)) {
    return { ok: false, changed: false, detail: `contagem de commits atras de origin/${base} veio ilegivel: ${JSON.stringify(contagem.stdout.slice(0, 60))}` }
  }
  if (!atras) return { ok: true, changed: false, detail: `ja atualizado com origin/${base}` }
  const m = await runGit(wt, ['merge', '--no-edit', `origin/${base}`])
  if (m.err) {
    await runGit(wt, ['merge', '--abort'])
    return { ok: false, changed: false, detail: `conflito ao integrar ${atras} commit(s) de origin/${base}` }
  }
  return { ok: true, changed: true, detail: `integrou ${atras} commit(s) de origin/${base}` }
}

export async function ensureWorktree(target: string, wt: string, branch: string, base: string): Promise<WorktreeInfo> {
  return withGitLock(async () => {
    const f = await runGit(target, ['fetch', 'origin', base])
    if (f.err) {
      throw new Error(`fetch origin/${base} falhou — a branch nasceria de estado velho: ${String(f.stderr || '').slice(0, 120)}`)
    }
    const ref = await runGit(target, ['rev-parse', `origin/${base}`])
    if (ref.err || !ref.stdout.trim()) {
      throw new Error(`origin/${base} nao existe no remoto — confira a branch base do alvo em config/repos.json`)
    }
    await runGit(target, ['worktree', 'prune'])
    if (existsSync(wt)) {
      await runGit(target, ['worktree', 'remove', '--force', wt])
      if (existsSync(wt)) rmSync(wt, { recursive: true, force: true })
    }
    for (const other of await worktreesHoldingBranch(target, branch)) {
      if (other !== wt) await runGit(target, ['worktree', 'remove', '--force', other])
    }
    if (!existsSync(WT_BASE)) mkdirSync(WT_BASE, { recursive: true })
    const r = await runGit(target, ['worktree', 'add', '-B', branch, wt, `origin/${base}`])
    if (r.err) throw new Error('worktree add: ' + String(r.stderr || '').slice(0, 160))
    const nm = join(wt, 'node_modules')
    if (!existsSync(nm) && existsSync(join(target, 'node_modules'))) {
      try { symlinkSync(join(target, 'node_modules'), nm, 'dir') } catch { void 0 }
    }
    return { path: wt, baseCommit: ref.stdout.trim().slice(0, 7) }
  })
}

export async function worktreeOnBranch(wt: string, branch: string): Promise<boolean> {
  if (!existsSync(wt)) return false
  const r = await runGit(wt, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return r.stdout.trim() === branch
}

export async function removeWorktree(target: string, wt: string): Promise<void> {
  if (wt && existsSync(wt)) await withGitLock(() => runGit(target, ['worktree', 'remove', '--force', wt]))
}

export type WorktreeFate = 'discard' | 'keep-for-inspection'

export async function settleWorktree(target: string, wt: string, fate: WorktreeFate): Promise<void> {
  if (fate === 'discard') await removeWorktree(target, wt)
}

export type PushFailureReason = 'none' | 'no-anchor' | 'diverged' | 'other'

export interface PushResult {
  ok: boolean
  forced: boolean
  detail: string
  failureReason: PushFailureReason
  pushedSha: string
}

function trimmed(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim().slice(0, 220)
}

function isNonFastForward(stderr: string): boolean {
  return /\[rejected\]|non-fast-forward|fetch first|stale info/i.test(stderr)
}

async function shaRemotoAtual(wt: string, branch: string): Promise<string> {
  const r = await runGit(wt, ['ls-remote', 'origin', `refs/heads/${branch}`])
  if (r.err) return ''
  return (r.stdout.trim().split(/\s+/)[0] ?? '').trim()
}

export async function pushOwnedBranch(wt: string, branch: string, knownRemoteSha: string, donoComprovado = false): Promise<PushResult> {
  return withGitLock(async () => {
    const head = await runGit(wt, ['rev-parse', 'HEAD'])
    const localSha = head.stdout.trim()
    const first = await runGit(wt, ['push', '--no-verify', '-u', 'origin', branch])
    if (!first.err) return { ok: true, forced: false, detail: '', failureReason: 'none', pushedSha: localSha }
    const detail = trimmed(String(first.stderr || ''))
    if (!isNonFastForward(detail)) return { ok: false, forced: false, detail, failureReason: 'other', pushedSha: '' }
    const ancora = knownRemoteSha || (donoComprovado ? await shaRemotoAtual(wt, branch) : '')
    if (!ancora) return { ok: false, forced: false, detail, failureReason: 'no-anchor', pushedSha: '' }
    const forced = await runGit(wt, ['push', '--no-verify', `--force-with-lease=${branch}:${ancora}`, '-u', 'origin', branch])
    if (!forced.err) return { ok: true, forced: true, detail: '', failureReason: 'none', pushedSha: localSha }
    return { ok: false, forced: true, detail: trimmed(String(forced.stderr || '')), failureReason: 'diverged', pushedSha: '' }
  })
}
