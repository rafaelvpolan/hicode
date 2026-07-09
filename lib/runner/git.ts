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

export async function ensureWorktree(target: string, wt: string, branch: string, base: string): Promise<string> {
  return withGitLock(async () => {
    await runGit(target, ['fetch', 'origin', base])
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
    return wt
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
