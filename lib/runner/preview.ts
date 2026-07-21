import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { CARDS_DIR, ROOT, PREVIEW_BASE_PORT } from './config'
import { run } from './git'

export interface PreviewHealth {
  ok: boolean
  conclusive: boolean
  detail: string
}

export function previewPort(id: string): number {
  return PREVIEW_BASE_PORT + (Number(id) || 0)
}

export function hasBuildScript(target: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    return !!(pkg.scripts && pkg.scripts.build)
  } catch {
    return false
  }
}

export function hasTestScript(target: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    return !!(pkg.scripts && pkg.scripts.test)
  } catch {
    return false
  }
}

export function startPreview(wt: string, port: number): number {
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--host'], { cwd: wt, detached: true, stdio: 'ignore' })
  child.unref()
  return child.pid || 0
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
  const dir = join(CARDS_DIR, 'previews', String(id))
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
