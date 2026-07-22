import type { H3Event, MultiPartData } from 'h3'
import type { RefsResponse } from '#shared/types'

interface RefsLinksBody {
  links?: string[]
}

function isMultipartRequest(event: H3Event): boolean {
  const contentType = getHeader(event, 'content-type') || ''
  return contentType.includes('multipart/form-data')
}

async function collectUploadedPaths(event: H3Event, id: string): Promise<string[]> {
  const parts = await readMultipartFormData(event)
  const files: MultiPartData[] = (parts || []).filter((part) => !!part.filename)
  return files.map((part) => saveRefUpload(id, part.filename || 'upload', part.type || '', part.data))
}

export default defineEventHandler(async (event): Promise<RefsResponse> => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')

  if (isMultipartRequest(event)) {
    const paths = await collectUploadedPaths(event, id)
    if (!paths.length) { setResponseStatus(event, 400); return { id, refs: readRefs(id), error: 'nenhum arquivo enviado' } }
    return { id, refs: addRefs(id, paths) }
  }

  const body = await readBody<RefsLinksBody>(event).catch(() => ({}) as RefsLinksBody)
  const links = (body.links || []).map((link) => link.trim()).filter(Boolean)
  if (!links.length) { setResponseStatus(event, 400); return { id, refs: readRefs(id), error: 'nenhum link informado' } }
  return { id, refs: addRefs(id, links) }
})
