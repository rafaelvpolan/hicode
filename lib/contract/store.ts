import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { probeContract } from './probe'
import type { Contract } from './types'

export function contractFile(repo: string): string {
  return join(repo, '.hii', 'contract.json')
}

export function readContract(repo: string): Contract | null {
  const f = contractFile(repo)
  if (!existsSync(f)) return null
  try {
    const parsed = JSON.parse(readFileSync(f, 'utf8')) as Contract
    return parsed && parsed.version === 1 ? parsed : null
  } catch {
    return null
  }
}

export function writeContract(repo: string, contract: Contract): string {
  const dir = join(repo, '.hii')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const f = contractFile(repo)
  writeFileSync(f, JSON.stringify(contract, null, 2) + '\n')
  return f
}

export interface SyncResult {
  contract: Contract
  changed: boolean
  file: string
}

export function syncContract(repo: string, now: string): SyncResult {
  const fresh = probeContract(repo, now)
  const current = readContract(repo)
  if (current && current.hash === fresh.hash) return { contract: current, changed: false, file: contractFile(repo) }
  return { contract: fresh, changed: true, file: writeContract(repo, fresh) }
}

export function ensureContract(repo: string, now: string): Contract {
  return readContract(repo) ?? syncContract(repo, now).contract
}
