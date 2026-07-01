import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

export default defineEventHandler(async (event) => {
  const repos = readRepos()
  const repo = repos[0]
  if (!repo) { setResponseStatus(event, 400); return { error: 'nenhum repo configurado' } }
  const port = Number(process.env.HICODE_PROJECT_PORT || 5173)
  const url = `http://localhost:${port}`
  let running = false
  try { await $fetch(url, { timeout: 1500 }); running = true } catch { running = false }
  if (running) return { url, running: true }
  const target = repoLocalPath(repo.name)
  if (!existsSync(target)) { setResponseStatus(event, 400); return { error: 'repo nao clonado: ' + target } }
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--host'], { cwd: target, detached: true, stdio: 'ignore' })
  child.unref()
  return { url, running: false, started: true }
})
