import { existsSync, readFileSync } from 'node:fs'

export default defineEventHandler((event) => {
  const id = parseCardId(getRouterParam(event, 'id'))
  if (!id) { setResponseStatus(event, 400); return 'id invalido' }

  const out = previewPngPath(id)
  if (!existsSync(out)) { setResponseStatus(event, 404); return 'sem screenshot' }
  setHeader(event, 'content-type', 'image/png')
  return readFileSync(out)
})
