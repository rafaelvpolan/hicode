import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

interface PreviewQuery {
  fresh?: string
}

function previewPngPath(id: string): string {
  return join(CARDS_DIR, 'previews', id, 'preview.png')
}

function captureScreenshot(id: string, url: string): boolean {
  const dir = join(CARDS_DIR, 'previews', id)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const out = previewPngPath(id)
  const result = spawnSync(
    'npx',
    ['--no-install', 'playwright', 'screenshot', '--viewport-size=1280,900', '--full-page', url, out],
    { cwd: ROOT, timeout: 60000 },
  )
  return result.status === 0 && existsSync(out)
}

export default defineEventHandler((event) => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const query = getQuery<PreviewQuery>(event)
  const out = previewPngPath(id)

  if (query.fresh === '1' || !existsSync(out)) {
    const card = readCards().find((c) => c.id === id)
    const url = card?.preview_url || ''
    if (url) captureScreenshot(id, url)
  }

  if (!existsSync(out)) { setResponseStatus(event, 404); return 'sem screenshot' }
  setHeader(event, 'content-type', 'image/png')
  return readFileSync(out)
})
