import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { ApiError, ProjectPreviewResponse } from '#shared/types'

const IN_FLIGHT = new Set<string>([
  'EXECUTING', 'PAUSED', 'EXECUTED', 'PREVIEW', 'PREVIEW_OK',
  'REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED', 'CLEANED', 'HALTED',
])

async function isUp(url: string): Promise<boolean> {
  try {
    await $fetch(url, { timeout: 1500 })
    return true
  } catch {
    return false
  }
}

function startDev(cwd: string, port: number): void {
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--host'], { cwd, detached: true, stdio: 'ignore' })
  child.unref()
}

export default defineEventHandler(async (event): Promise<ProjectPreviewResponse | ApiError> => {
  const repos = readRepos()
  const repo = repos[0]
  if (!repo) { setResponseStatus(event, 400); return { error: 'nenhum repo configurado' } }

  const base = Number(process.env.HICODE_PROJECT_PORT || 5173)

  const wip = readCards()
    .filter(c => IN_FLIGHT.has(c.status || '') && !!c.worktree && existsSync(c.worktree))
    .sort((a, b) => Number(b.id) - Number(a.id))[0]

  if (wip && wip.worktree) {
    const branch = wip.branch || `hicode/${wip.id}-${wip.slug}`
    if (wip.preview_url && await isUp(wip.preview_url)) {
      return { url: wip.preview_url, running: true, source: 'wip', branch, cardId: wip.id }
    }
    const port = base + Number(wip.id)
    const url = `http://localhost:${port}`
    if (await isUp(url)) return { url, running: true, source: 'wip', branch, cardId: wip.id }
    startDev(wip.worktree, port)
    return { url, running: false, started: true, source: 'wip', branch, cardId: wip.id }
  }

  const target = repoLocalPath(repo.name)
  if (!existsSync(target)) { setResponseStatus(event, 400); return { error: 'repo nao clonado: ' + target } }
  const url = `http://localhost:${base}`
  if (await isUp(url)) return { url, running: true, source: 'main', branch: repo.branch || 'main' }
  startDev(target, base)
  return { url, running: false, started: true, source: 'main', branch: repo.branch || 'main' }
})
