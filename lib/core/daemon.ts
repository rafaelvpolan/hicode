import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { ROOT, cardsDir } from '../runner/config'
import { ENV_RUNNER_PIDFILE } from '../runner/environment-contract'

const ENGINE_MARK = 'runner.ts'
const ENGINE_RUNTIME = 'bun'

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
  return process.env[ENV_RUNNER_PIDFILE] || join(ROOT, '.runner.pid')
}

export function rootFile(): string {
  return `${pidFile()}.root`
}

function raizDoMotorRegistrada(): string {
  try {
    return readFileSync(rootFile(), 'utf8').trim() || ROOT
  } catch {
    return ROOT
  }
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

export function argvDoProcesso(pid: number): readonly string[] | null {
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    return cmdline.split('\0').filter(parte => parte.length > 0)
  } catch {
    return null
  }
}

function rodaNaRaiz(pid: number, raiz: string): boolean {
  try {
    return realpathSync(`/proc/${pid}/cwd`) === realpathSync(raiz)
  } catch {
    return false
  }
}

export function eOMotor(argv: readonly string[]): boolean {
  if (basename(argv[0] ?? '') !== ENGINE_RUNTIME) return false
  return argv.slice(1).some(arg => arg === ENGINE_MARK || arg.endsWith(`/${ENGINE_MARK}`))
}

function eOMotorDaRaiz(pid: number, raiz: string): boolean {
  const argv = argvDoProcesso(pid)
  if (argv === null) return argvDoProcesso(process.pid) === null
  return eOMotor(argv) && rodaNaRaiz(pid, raiz)
}

export function daemonPid(): number {
  const f = pidFile()
  if (!existsSync(f)) return 0
  const pid = Number(String(readFileSync(f, 'utf8')).trim())
  return alive(pid) && eOMotorDaRaiz(pid, raizDoMotorRegistrada()) ? pid : 0
}

export function daemonStatus(): string {
  const pid = daemonPid()
  return pid ? `online (pid ${pid})` : 'offline'
}
