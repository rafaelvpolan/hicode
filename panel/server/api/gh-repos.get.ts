import { execFile } from 'node:child_process'
import type { GhReposResponse } from '#shared/types'

export default defineEventHandler(async (): Promise<GhReposResponse> => {
  return await new Promise<GhReposResponse>((resolveP) => {
    execFile('gh', ['repo', 'list', '--limit', '100', '--json', 'nameWithOwner,description,url,visibility'],
      { timeout: 15000 }, (err, stdout) => {
        if (err) return resolveP({ error: 'gh indisponivel ou nao autenticado', items: [] })
        try { resolveP({ items: JSON.parse(stdout) }) } catch { resolveP({ error: 'parse', items: [] }) }
      })
  })
})
