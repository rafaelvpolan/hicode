import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { ApiError, ProjectPreviewResponse } from '#shared/types'

async function isUp(url: string): Promise<boolean> {
  try {
    await $fetch(url, { timeout: 1500 })
    return true
  } catch {
    return false
  }
}

function git(cwd: string, args: string[]): boolean {
  return spawnSync('git', args, { cwd, stdio: 'ignore', timeout: 20000 }).status === 0
}

function checkoutBranch(cwd: string, branch: string): boolean {
  git(cwd, ['fetch', 'origin', branch])
  if (!git(cwd, ['checkout', branch])) return false
  git(cwd, ['pull', '--ff-only', 'origin', branch])
  return true
}

function startDev(cwd: string, port: number): void {
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--host'], { cwd, detached: true, stdio: 'ignore' })
  child.unref()
}

export default defineEventHandler(async (event): Promise<ProjectPreviewResponse | ApiError> => {
  const repos = readRepos()
  const repo = repos[0]
  if (!repo) { setResponseStatus(event, 400); return { error: 'nenhum repo configurado' } }

  const target = repoLocalPath(repo.name)
  if (!existsSync(target)) { setResponseStatus(event, 400); return { error: 'repo nao clonado: ' + target } }

  const branch = repo.branch || 'main'
  if (!checkoutBranch(target, branch)) {
    setResponseStatus(event, 409)
    return { error: `nao consegui trocar ${target} para a branch "${branch}" (ha mudancas locais no repo?)` }
  }

  const base = Number(process.env.HICODE_PROJECT_PORT || 5173)
  const url = `http://localhost:${base}`
  if (await isUp(url)) return { url, running: true, source: 'main', branch }
  startDev(target, base)
  return { url, running: false, started: true, source: 'main', branch }
})
