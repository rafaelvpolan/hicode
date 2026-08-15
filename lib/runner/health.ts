import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isoNow } from '../card'
import { cardsDir } from './config'

export interface DaemonHealth {
  consecutiveFailures: number
  lastError: string
  lastErrorAt: string
}

const EMPTY_HEALTH: DaemonHealth = { consecutiveFailures: 0, lastError: '', lastErrorAt: '' }

const ESCALATE_AFTER = Number(process.env.HICODE_TICK_ESCALATE_AFTER || 3)

function healthFile(): string {
  return join(cardsDir(), 'runs', 'daemon-health.json')
}

interface PartialHealth {
  consecutiveFailures?: number
  lastError?: string
  lastErrorAt?: string
}

export function readDaemonHealth(): DaemonHealth {
  const f = healthFile()
  if (!existsSync(f)) return { ...EMPTY_HEALTH }
  try {
    return { ...EMPTY_HEALTH, ...(JSON.parse(readFileSync(f, 'utf8')) as PartialHealth) }
  } catch {
    return { ...EMPTY_HEALTH }
  }
}

function writeHealth(h: DaemonHealth): void {
  try {
    const dir = join(cardsDir(), 'runs')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(healthFile(), JSON.stringify(h, null, 2))
  } catch {
    void 0
  }
}

export function recordTickSuccess(): void {
  const prev = readDaemonHealth()
  if (prev.consecutiveFailures) writeHealth({ ...EMPTY_HEALTH })
}

export function reportTickFailure(context: string, error: Error): DaemonHealth {
  const message = `${context}: ${error.message || String(error)}`
  const prev = readDaemonHealth()
  const repeating = prev.lastError === message
  const health: DaemonHealth = {
    consecutiveFailures: repeating ? prev.consecutiveFailures + 1 : 1,
    lastError: message,
    lastErrorAt: isoNow(),
  }
  writeHealth(health)
  const primeiraVez = !repeating
  const marco = health.consecutiveFailures % ESCALATE_AFTER === 0
  if (primeiraVez || marco) {
    const prefixo = health.consecutiveFailures >= ESCALATE_AFTER
      ? `ALERTA: tick falhando ha ${health.consecutiveFailures} ciclos seguidos com o MESMO erro — o daemon segue de pe, mas investigue`
      : 'ERRO no tick'
    process.stderr.write(`[runner] ${prefixo}: ${message}\n`)
  }
  return health
}
