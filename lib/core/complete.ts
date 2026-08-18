import { COMMANDS, canonico } from './session'

export interface CompleteContext {
  repos: string[]
  cards: string[]
  provedores?: string[]
  modelos?: string[]
  esforcos?: string[]
  papeis?: string[]
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

  const principal = canonico(head)
  if (principal === '/ia') return [byPrefix([...(ctx.papeis ?? []), ...(ctx.provedores ?? [])], arg), arg]
  if (principal === '/model') return [byPrefix([...(ctx.papeis ?? []), ...(ctx.modelos ?? []), 'padrao'], arg), arg]
  if (principal === '/effort') return [byPrefix([...(ctx.papeis ?? []), ...(ctx.esforcos ?? []), 'padrao'], arg), arg]
  if (principal === '/repo') return [byPrefix(ctx.repos, arg), arg]
  if (['/stop', '/rm', '/ask'].includes(principal)) return [byPrefix(ctx.cards, arg), arg]
  return [[], arg]
}
