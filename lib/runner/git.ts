import { existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { join, basename } from 'node:path'
import { execFile, type ExecFileException, type ExecFileOptions } from 'node:child_process'
import { WT_BASE } from './config'

export interface RunResult {
  err: ExecFileException | null
  stdout: string
  stderr: string
}

export function run(cmd: string, args: string[], opts?: ExecFileOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 1 << 24, ...opts }, (err, stdout, stderr) => {
      resolve({ err, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
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

export async function ensureWorktree(target: string, wt: string, branch: string, base: string): Promise<string> {
  return withGitLock(async () => {
    await runGit(target, ['fetch', 'origin', base])
    if (existsSync(wt)) await runGit(target, ['worktree', 'remove', '--force', wt])
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

export async function removeWorktree(target: string, wt: string): Promise<void> {
  if (wt && existsSync(wt)) await withGitLock(() => runGit(target, ['worktree', 'remove', '--force', wt]))
}
