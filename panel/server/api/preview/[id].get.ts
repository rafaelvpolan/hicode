import { readFileSync } from 'node:fs'

export default defineEventHandler((event) => {
  const id = String(getRouterParam(event, 'id') || '')
  const p = previewFile(id)
  if (!p) { setResponseStatus(event, 404); return 'sem screenshot' }
  setHeader(event, 'content-type', 'image/png')
  return readFileSync(p)
})
