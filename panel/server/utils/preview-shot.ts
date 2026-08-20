import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { CARDS_DIR, ROOT } from './card-io'

export function previewPngPath(id: string): string {
  return join(CARDS_DIR, 'previews', id, 'preview.png')
}

export function captureScreenshot(id: string, url: string): boolean {
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
