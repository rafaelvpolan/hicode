import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { cardsDir, ROOT, PREVIEW_BASE_PORT } from './config'
import { run } from './git'
import { readContract } from '../contract/store'
import { devCommand, devCwd, hasCommand } from './commands'

export interface PreviewHealth {
  ok: boolean
  conclusive: boolean
  detail: string
}

export function previewPort(id: string): number {
  return PREVIEW_BASE_PORT + (Number(id) || 0)
}

export function hasDevServer(target: string): boolean {
  return hasCommand(readContract(target), 'dev')
}

export async function freePort(port: number): Promise<void> {
  await run('bash', ['-c', `fuser -k ${port}/tcp 2>/dev/null; exit 0`], { timeout: 8000 })
  await new Promise(r => setTimeout(r, 400))
}

export function startPreview(wt: string, port: number, target: string): number {
  const contract = readContract(target)
  if (!contract) return 0
  const cmd = devCommand(contract, port)
  if (!cmd) return 0
  const child = spawn(cmd.cmd, cmd.args, { cwd: devCwd(contract, wt), detached: true, stdio: 'ignore' })
  child.unref()
  return child.pid || 0
}

export function pidAlive(pid: string | undefined): boolean {
  const n = Number(pid)
  if (!n) return false
  try {
    process.kill(n, 0)
    return true
  } catch {
    return false
  }
}

export interface PreviewHandle {
  pid: number
  reused: boolean
}

export async function ensurePreview(wt: string, port: number, target: string, knownPid?: string): Promise<PreviewHandle> {
  if (pidAlive(knownPid) && await httpOk(`http://localhost:${port}`)) {
    return { pid: Number(knownPid), reused: true }
  }
  await freePort(port)
  return { pid: startPreview(wt, port, target), reused: false }
}

export function stopPreview(pid: string | undefined): void {
  const n = Number(pid)
  if (!n) return
  try {
    process.kill(-n, 'SIGTERM')
  } catch {
    try { process.kill(n, 'SIGTERM') } catch { void 0 }
  }
}

export async function httpOk(url: string): Promise<boolean> {
  const r = await run('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', url], { timeout: 4000 })
  return String(r.stdout || '').trim() === '200'
}

export async function waitHttp(url: string, tries: number): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const r = await run('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', url], { timeout: 5000 })
    if (String(r.stdout || '').trim() === '200') return true
    await new Promise(res => setTimeout(res, 1000))
  }
  return false
}

export async function inspectPreview(id: string, url: string, capture: boolean): Promise<PreviewHealth> {
  const dir = join(cardsDir(), 'previews', String(id))
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const out = capture ? join(dir, 'preview.png') : ''
  const r = await run('bun', [join(ROOT, 'scripts', 'inspect-preview.mjs'), url, out], { cwd: ROOT, timeout: 60000 })
  try {
    const j = JSON.parse(String(r.stdout || '')) as { ok?: boolean; conclusive?: boolean; detail?: string }
    return { ok: !!j.ok, conclusive: !!j.conclusive, detail: String(j.detail || '') }
  } catch {
    return { ok: false, conclusive: false, detail: 'inspecao do preview nao concluida (playwright ausente ou pagina inacessivel)' }
  }
}
