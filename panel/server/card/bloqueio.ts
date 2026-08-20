import { openSync, closeSync, unlinkSync, statSync, writeFileSync, renameSync } from 'node:fs'

const STALE_MS = Number(process.env.HICODE_LOCK_STALE_MS || 15000)
const ACQUIRE_TIMEOUT_MS = Number(process.env.HICODE_LOCK_TIMEOUT_MS || 10000)
const waitBuffer = new Int32Array(new SharedArrayBuffer(4))

function sleepSync(ms: number): void {
  Atomics.wait(waitBuffer, 0, 0, ms)
}

function isStale(lock: string): boolean {
  try {
    return Date.now() - statSync(lock).mtimeMs > STALE_MS
  } catch {
    return false
  }
}

function release(lock: string): void {
  try {
    unlinkSync(lock)
  } catch {
    void 0
  }
}

interface ErroDeSistema {
  code?: string
}

function codigoDoErro(e: ErroDeSistema): string {
  return typeof e?.code === 'string' ? e.code : ''
}

function acquire(lock: string): void {
  const start = Date.now()
  let liberou = false
  for (;;) {
    try {
      closeSync(openSync(lock, 'wx'))
      return
    } catch (e) {
      const erro = e as ErroDeSistema
      if (codigoDoErro(erro) !== 'EEXIST') throw e
      const estourou = Date.now() - start > ACQUIRE_TIMEOUT_MS
      if (isStale(lock) || estourou) {
        if (liberou && estourou) {
          throw new Error(`nao consegui tomar o lock ${lock} apos ${ACQUIRE_TIMEOUT_MS}ms — outro processo o recria mais rapido que a liberacao`)
        }
        liberou = true
        release(lock)
        sleepSync(2)
        continue
      }
      sleepSync(2)
    }
  }
}

export function withFileLock<T>(target: string, fn: () => T): T {
  const lock = `${target}.lock`
  acquire(lock)
  try {
    return fn()
  } finally {
    release(lock)
  }
}

export function writeFileAtomic(file: string, content: string): void {
  const tmp = `${file}.tmp.${process.pid}`
  writeFileSync(tmp, content)
  renameSync(tmp, file)
}
