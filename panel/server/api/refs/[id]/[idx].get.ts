import { existsSync, readFileSync } from 'node:fs'

export default defineEventHandler((event): string | Buffer => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const idx = Number(getRouterParam(event, 'idx') || '-1')

  if (!Number.isInteger(idx) || idx < 0) { setResponseStatus(event, 400); return 'idx invalido' }

  const source = refAt(id, idx)
  if (!source) { setResponseStatus(event, 404); return 'ref nao encontrada' }
  if (isRefUrl(source)) { setResponseStatus(event, 400); return 'ref e uma url — use-a diretamente' }
  if (!isRefUploadPath(id, source) || !existsSync(source)) { setResponseStatus(event, 404); return 'arquivo nao encontrado' }

  const mime = mimeForRefPath(source)
  setHeader(event, 'content-type', mime)
  setHeader(event, 'x-content-type-options', 'nosniff')
  if (mime === 'image/svg+xml') {
    setHeader(event, 'content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:")
    setHeader(event, 'content-disposition', `attachment; filename="ref-${idx}.svg"`)
  }
  return readFileSync(source)
})
