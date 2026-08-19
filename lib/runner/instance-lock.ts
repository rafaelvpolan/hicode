import { linkSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { alive, argvDoProcesso, eOMotor } from '../core/daemon'
import { ROOT } from './config'
import { ENV_RUNNER_LOCK } from './environment-contract'

const STEAL_ATTEMPTS = 3

export interface InstanceLock {
  readonly acquired: boolean
  readonly holder: number
}

export function lockFile(): string {
  return process.env[ENV_RUNNER_LOCK] || join(ROOT, '.runner.lock')
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

function heldByEngine(pid: number): boolean {
  if (!alive(pid)) return false
  const argv = argvDoProcesso(pid)
  if (argv === null) return argvDoProcesso(process.pid) === null
  return eOMotor(argv)
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
