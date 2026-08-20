import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MotorDaemonStatus, MotorStatus } from './types'
import { cardsDir, reposFile, iaFile, runnerPidfile, runnerLock } from './ambiente'

function pidVivo(pid: number): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function lerPid(): number | null {
  const f = runnerPidfile()
  if (!existsSync(f)) return null
  const pid = Number(readFileSync(f, 'utf8').trim())
  return Number.isFinite(pid) && pid > 0 ? pid : null
}

function contarArquivosCom(dir: string, sufixo: string): number {
  if (!existsSync(dir)) return 0
  return readdirSync(dir).filter(f => f.endsWith(sufixo)).length
}

function contarRepos(): number {
  try {
    const lista = JSON.parse(readFileSync(reposFile(), 'utf8')) as object[]
    return Array.isArray(lista) ? lista.length : 0
  } catch {
    return 0
  }
}

export function statusDoDaemon(): MotorDaemonStatus {
  const pid = lerPid()
  return { pid, running: pid !== null && pidVivo(pid), lockHeld: existsSync(runnerLock()) }
}

export function lerStatus(): MotorStatus {
  return {
    daemon: statusDoDaemon(),
    cardCount: contarArquivosCom(cardsDir(), '.md'),
    runCount: contarArquivosCom(join(cardsDir(), 'runs'), '.json'),
    repoCount: contarRepos(),
    iaConfigured: existsSync(iaFile()),
  }
}
