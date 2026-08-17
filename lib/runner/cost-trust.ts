import { isoNow } from '../card'
import type { Fields } from '../card'
import type { AgentRequest, AgentResult, AiProvider } from '../ai/types'
import { patchCard, patchCardWith, readCard } from './card-store'
import { addProvider, classifyCostGap, floorProviders, formatProviders, parseProviders, removeProvider } from './cost-gap'

function semReporte(fm: Fields, provider: string): boolean {
  return parseProviders(fm.cost_unverified).includes(provider)
}

function noPiso(fm: Fields, provider: string): boolean {
  return parseProviders(fm.cost_floor).includes(provider)
}

function linhaDeLimpeza(fm: Fields, provider: string): string {
  const resto = formatProviders(removeProvider(fm.cost_unverified, provider))
  const cauda = resto ? `; segue sem reporte: ${resto}` : ''
  return `${isoNow()} custo medido: ${provider} informou o gasto desta chamada — marca de custo nao reportado retirada (o cost_usd deste card segue sendo piso)${cauda}`
}

export function markCostUnverified(id: string, provider: string): void {
  if (!id || !provider) return
  patchCardWith(
    id,
    (fm): Fields => (semReporte(fm, provider)
      ? {}
      : {
        cost_unverified: formatProviders(addProvider(fm.cost_unverified, provider)),
        cost_floor: formatProviders(addProvider(fm.cost_floor, provider)),
      }),
    fm => (semReporte(fm, provider)
      ? ''
      : `${isoNow()} custo NAO reportado: a chamada a ${provider} terminou sem informar gasto — o cost_usd deste card e piso medido, nao o total`),
  )
}

export function markCostFloor(id: string, provider: string): void {
  if (!id || !provider) return
  if (noPiso(readCard(id)?.fm ?? {}, provider)) return
  patchCardWith(
    id,
    (fm): Fields => (noPiso(fm, provider) ? {} : { cost_floor: formatProviders(addProvider(fm.cost_floor, provider)) }),
    fm => (noPiso(fm, provider)
      ? ''
      : `${isoNow()} chamada a ${provider} terminou sem concluir — o gasto ate a interrupcao nao foi reportado e nao entra no cost_usd, que segue sendo piso`),
  )
}

export function clearCostUnverified(id: string, provider: string): void {
  if (!id || !provider) return
  if (!semReporte(readCard(id)?.fm ?? {}, provider)) return
  patchCardWith(
    id,
    (fm): Fields => (semReporte(fm, provider) ? { cost_unverified: formatProviders(removeProvider(fm.cost_unverified, provider)) } : {}),
    fm => (semReporte(fm, provider) ? linhaDeLimpeza(fm, provider) : ''),
  )
}

export function recordCostTrust(id: string, provider: string, res: AgentResult): void {
  const gap = classifyCostGap(res)
  if (gap === 'measured') clearCostUnverified(id, provider)
  else if (gap === 'unreported') markCostUnverified(id, provider)
  else if (gap === 'call_failed') markCostFloor(id, provider)
}

export async function runProvider(id: string, provider: AiProvider, req: AgentRequest): Promise<AgentResult> {
  const res = await provider.run(req)
  recordCostTrust(id, provider.name, res)
  return res
}

export function warnBudgetWithoutGuarantee(id: string, fm: Fields, budgetUsd: number): void {
  const provedores = formatProviders(floorProviders(fm))
  if (!provedores || budgetUsd <= 0) return
  patchCard(id, {}, `${isoNow()} teto de US$${budgetUsd} SEM GARANTIA: ao menos uma chamada a ${provedores} terminou sem reportar gasto — US$${fm.cost_usd || '0'} e piso medido; o total real deste card nao e verificavel`)
}
