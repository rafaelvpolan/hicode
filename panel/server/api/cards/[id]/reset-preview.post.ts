import { spawn, spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { ApiError, ResetPreviewResponse } from '#shared/types'

interface ResetPreviewBody {
  hard?: boolean
}

const HARD_CLEAN_DIRS = ['node_modules/.vite', '.vite', '.vite-cache', '.nuxt']
const POLL_TRIES = 25

async function isUp(url: string): Promise<boolean> {
  try {
    await $fetch(url, { timeout: 1500 })
    return true
  } catch {
    return false
  }
}

function computePort(id: string, previewUrl: string): number {
  const fromUrl = Number(previewUrl.match(/:(\d+)/)?.[1] || 0)
  if (fromUrl > 0) return fromUrl
  return Number(process.env.HICODE_PREVIEW_BASE || 5200) + Number(id)
}

function killOldServer(pid: number): void {
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try { process.kill(pid, 'SIGTERM') } catch { void 0 }
  }
}

function hardClean(worktree: string): void {
  for (const dir of HARD_CLEAN_DIRS) {
    try { rmSync(join(worktree, dir), { recursive: true, force: true }) } catch { void 0 }
  }
}

function freePort(port: number): void {
  try { spawnSync('bash', ['-c', `fuser -k ${port}/tcp 2>/dev/null; exit 0`], { timeout: 8000 }) } catch { void 0 }
}

function startDevServer(worktree: string, port: number): number {
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort', '--host'], { cwd: worktree, detached: true, stdio: 'ignore' })
  child.unref()
  return child.pid || 0
}

async function waitForUp(url: string, tries: number): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await isUp(url)) return true
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return false
}

async function waitForDown(url: string, tries: number): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (!(await isUp(url))) return true
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

export default defineEventHandler(async (event): Promise<ResetPreviewResponse | ApiError> => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const card = readCards().find((c) => c.id === id)
  if (!card) { setResponseStatus(event, 404); return { error: 'card nao encontrado' } }

  if (!card.worktree || !existsSync(card.worktree)) {
    setResponseStatus(event, 409)
    return { error: 'card sem worktree ativo — nao ha preview para reiniciar' }
  }
  if (!card.preview_url) {
    setResponseStatus(event, 409)
    return { error: 'card sem preview_url — inicie o preview primeiro' }
  }

  const body = await readBody<ResetPreviewBody>(event).catch(() => ({}) as ResetPreviewBody)
  const hard = !!body.hard

  const port = computePort(id, card.preview_url)
  const url = card.preview_url
  const oldPid = Number(card.preview_pid || 0)
  if (oldPid > 0) killOldServer(oldPid)
  await waitForDown(url, 16)
  freePort(port)
  if (hard) hardClean(card.worktree)

  const pid = startDevServer(card.worktree, port)
  const running = await waitForUp(url, POLL_TRIES)
  setPreviewPid(id, pid, hard)

  return { ok: true, url, running, hard }
})
