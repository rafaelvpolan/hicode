import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, cardsDir } from '../runner/config'

export type Autostart = 'yes' | 'no' | 'ask'

export interface ReplPrefs {
  autostart: Autostart
}

const DEFAULT_PREFS: ReplPrefs = { autostart: 'ask' }

function prefsFile(): string {
  return join(cardsDir(), 'runs', '.repl.json')
}

export function readPrefs(): ReplPrefs {
  const f = prefsFile()
  if (!existsSync(f)) return { ...DEFAULT_PREFS }
  try {
    const parsed = JSON.parse(readFileSync(f, 'utf8')) as Partial<ReplPrefs>
    const a = parsed.autostart
    return { autostart: a === 'yes' || a === 'no' ? a : 'ask' }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function writePrefs(prefs: ReplPrefs): void {
  const dir = join(cardsDir(), 'runs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(prefsFile(), JSON.stringify(prefs, null, 2) + '\n')
}

export function pidFile(): string {
  return process.env.HICODE_RUNNER_PIDFILE || join(ROOT, '.runner.pid')
}

export function alive(pid: number): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function daemonPid(): number {
  const f = pidFile()
  if (!existsSync(f)) return 0
  const pid = Number(String(readFileSync(f, 'utf8')).trim())
  return alive(pid) ? pid : 0
}

export function daemonStatus(): string {
  const pid = daemonPid()
  return pid ? `online (pid ${pid})` : 'offline'
}
