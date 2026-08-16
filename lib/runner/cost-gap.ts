import type { AgentResult } from '../ai/types'

export type CostGap = 'measured' | 'call_failed' | 'unreported'

export function classifyCostGap(res: AgentResult): CostGap {
  if (res.costMeasured) return 'measured'
  if (!res.ok || res.failed || res.timedOut || res.isError) return 'call_failed'
  return 'unreported'
}

export function parseProviders(raw: string | undefined): string[] {
  const vistos = new Set<string>()
  for (const p of String(raw ?? '').split(',')) {
    const nome = p.trim()
    if (nome) vistos.add(nome)
  }
  return [...vistos]
}

export function formatProviders(providers: string[]): string {
  return providers.join(', ')
}

export function addProvider(raw: string | undefined, provider: string): string[] {
  const atuais = parseProviders(raw)
  return atuais.includes(provider) ? atuais : [...atuais, provider]
}

export function removeProvider(raw: string | undefined, provider: string): string[] {
  return parseProviders(raw).filter(p => p !== provider)
}

export function unionProviders(...raws: Array<string | undefined>): string[] {
  return parseProviders(raws.join(','))
}
