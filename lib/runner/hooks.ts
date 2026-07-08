import { existsSync, mkdirSync, copyFileSync, chmodSync, rmSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { spawnSync } from 'node:child_process'

function hooksDir(repo: string): string | null {
  const r = spawnSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: repo, encoding: 'utf8' })
  if (r.status !== 0) return null
  const rel = String(r.stdout || '').trim()
  if (!rel) return null
  return isAbsolute(rel) ? rel : join(repo, rel)
}

export function installPrePush(repo: string, source: string): string | null {
  if (!existsSync(source)) return null
  const dir = hooksDir(repo)
  if (!dir) return null
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const dest = join(dir, 'pre-push')
  copyFileSync(source, dest)
  chmodSync(dest, 0o755)
  return dest
}

export function uninstallPrePush(repo: string): boolean {
  const dir = hooksDir(repo)
  if (!dir) return false
  const dest = join(dir, 'pre-push')
  if (!existsSync(dest)) return false
  rmSync(dest)
  return true
}
