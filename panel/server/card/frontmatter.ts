import type { Fields, Parsed } from './tipos'

export function splitFrontMatter(text: string): Parsed {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { fm: {}, order: [], body: text }
  const fm: Fields = {}
  const order: string[] = []
  for (const line of (m[1] ?? '').split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) {
      const k = line.slice(0, i).trim()
      fm[k] = line.slice(i + 1).trim()
      order.push(k)
    }
  }
  return { fm, order, body: m[2] ?? '' }
}

function umaLinha(valor: string | undefined): string {
  return (valor ?? '').replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function serializeCard(fm: Fields, order: string[], body: string): string {
  const keys = order.length ? order : Object.keys(fm)
  return `---\n${keys.map(k => `${k}: ${umaLinha(fm[k])}`).join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`
}
