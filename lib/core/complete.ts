import { COMMANDS } from './session'

export interface CompleteContext {
  repos: string[]
  cards: string[]
  statuses: string[]
}

export type Completion = [string[], string]

function byPrefix(all: string[], prefix: string): string[] {
  const hits = all.filter(a => a.startsWith(prefix))
  return hits.length ? hits : []
}

export function complete(line: string, ctx: CompleteContext): Completion {
  if (!line.startsWith('/')) return [[], line]
  const partes = line.split(/\s+/)
  const head = partes[0] ?? ''

  if (partes.length === 1) return [byPrefix([...COMMANDS], head), head]

  const arg = partes[partes.length - 1] ?? ''
  if (partes.length > 2) return [[], arg]

  if (head === '/repo') return [byPrefix(ctx.repos, arg), arg]
  if (head === '/cards' || head === '/ls') return [byPrefix(ctx.statuses, arg.toUpperCase()), arg]
  if (['/plan', '/watch', '/halt', '/ok', '/no'].includes(head)) return [byPrefix(ctx.cards, arg), arg]
  return [[], arg]
}
