import { join, dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const ENV_ROOT = 'HICODE_ROOT'
export const ENV_CARDS_DIR = 'HICODE_CARDS_DIR'
export const ENV_REPOS_FILE = 'HICODE_REPOS_FILE'
export const ENV_IA_FILE = 'HICODE_IA_FILE'
export const ENV_RUNNER_PIDFILE = 'HICODE_RUNNER_PIDFILE'
export const ENV_RUNNER_LOCK = 'HICODE_RUNNER_LOCK'
export const ENV_HII_HOME = 'HII_HOME'

const MARCADORES_DA_RAIZ = ['panel', 'cards', join('config', 'repos.json')]

function temMarcadoresDoRepo(dir: string): boolean {
  return MARCADORES_DA_RAIZ.some(m => existsSync(join(dir, m)))
}

function resolveRoot(): string {
  if (process.env[ENV_ROOT]) return process.env[ENV_ROOT]
  const doModulo = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))
  if (temMarcadoresDoRepo(doModulo)) return doModulo
  for (const c of [process.cwd(), resolve(process.cwd(), '..')]) {
    if (temMarcadoresDoRepo(c)) return c
  }
  return doModulo
}

export const ROOT = resolveRoot()

export function cardsDir(): string {
  return process.env[ENV_CARDS_DIR] || join(ROOT, 'cards')
}

export function reposFile(): string {
  return process.env[ENV_REPOS_FILE] || join(ROOT, 'config', 'repos.json')
}

export function iaFile(): string {
  return process.env[ENV_IA_FILE] || join(ROOT, 'config', 'ia.json')
}

export function runnerPidfile(): string {
  return process.env[ENV_RUNNER_PIDFILE] || join(ROOT, '.runner.pid')
}

export function runnerLock(): string {
  return process.env[ENV_RUNNER_LOCK] || join(ROOT, '.runner.lock')
}

export function hiiHome(): string {
  return process.env[ENV_HII_HOME] || join(dirname(ROOT), 'hii')
}
