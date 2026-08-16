import { linkSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { alive } from '../core/daemon'
import { ROOT } from './config'

const STEAL_ATTEMPTS = 3
const ENGINE_MARK = 'runner.ts'
const ENGINE_RUNTIME = 'bun'

export interface InstanceLock {
  readonly acquired: boolean
  readonly holder: number
}

export function lockFile(): string {
  return process.env.HICODE_RUNNER_LOCK || join(ROOT, '.runner.lock')
}

function readHolder(file: string): string {
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}

function createExclusive(file: string, pid: number): boolean {
  const staging = `${file}.${pid}.tmp`
  try {
    writeFileSync(staging, `${pid}\n`)
    linkSync(staging, file)
    return true
  } catch {
    return false
  } finally {
    try {
      unlinkSync(staging)
    } catch {
      void 0
    }
  }
}

function cmdlineOf(pid: number): string | null {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8')
  } catch {
    return null
  }
}

function runsEngine(cmdline: string): boolean {
  const argv = cmdline.split('\0').filter(part => part.length > 0)
  if (basename(argv[0] ?? '') !== ENGINE_RUNTIME) return false
  return argv.slice(1).some(arg => arg === ENGINE_MARK || arg.endsWith(`/${ENGINE_MARK}`))
}

function heldByEngine(pid: number): boolean {
  if (!alive(pid)) return false
  const cmdline = cmdlineOf(pid)
  if (cmdline === null) return cmdlineOf(process.pid) === null
  return runsEngine(cmdline)
}

function dropOrphan(file: string, holder: string): void {
  if (readHolder(file) !== holder) return
  try {
    unlinkSync(file)
  } catch {
    void 0
  }
}

export function acquireInstanceLock(file: string = lockFile()): InstanceLock {
  for (let attempt = 0; attempt < STEAL_ATTEMPTS; attempt++) {
    if (createExclusive(file, process.pid)) return { acquired: true, holder: process.pid }
    const holder = readHolder(file)
    const pid = Number(holder)
    if (pid === process.pid) return { acquired: true, holder: process.pid }
    if (pid && heldByEngine(pid)) return { acquired: false, holder: pid }
    dropOrphan(file, holder)
  }
  return { acquired: false, holder: Number(readHolder(file)) || 0 }
}

export function releaseInstanceLock(file: string = lockFile()): void {
  if (Number(readHolder(file)) !== process.pid) return
  try {
    unlinkSync(file)
  } catch {
    void 0
  }
}

export function holdInstanceLock(): InstanceLock {
  const file = lockFile()
  const lock = acquireInstanceLock(file)
  if (!lock.acquired) return lock
  process.on('exit', () => { releaseInstanceLock(file) })
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      releaseInstanceLock(file)
      process.exit(0)
    })
  }
  return lock
}

export function refusalMessage(holder: number): string {
  return `motor ja em execucao (pid ${holder}) — espere ele terminar; se for o daemon, pare com "hii stop"\n`
}
