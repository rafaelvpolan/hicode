const LIMITE_TITULO = 120

export function tituloDe(texto: string): string {
  const linhas = (texto ?? '').split('\n').map(l => l.replace(/\s+/g, ' ').trim())
  const base = linhas.find(Boolean) ?? ''
  return base.length > LIMITE_TITULO ? `${base.slice(0, LIMITE_TITULO - 1).trimEnd()}…` : base
}

export function extractObjetivo(body: string): string {
  const m = body.match(/##\s*Objetivo\s*\n([\s\S]*?)(?:\n##\s|$)/)
  return m ? (m[1] ?? '').trim() : ''
}

export function appendLog(body: string, line: string): string {
  const marker = '## Log de Estado'
  if (!body.includes(marker)) return `${body.trimEnd()}\n\n${marker}\n${line}`
  return `${body.trimEnd()}\n${line}`
}

export function setObjetivo(body: string, desc: string): string {
  if (body.includes('## Objetivo')) {
    return body.replace(/(##\s*Objetivo\s*\n)([\s\S]*?)(\n##\s|$)/, (_m, h, _old, tail) => `${h}${desc}${tail}`)
  }
  return `## Objetivo\n${desc}\n\n${body.replace(/^\n+/, '')}`
}
