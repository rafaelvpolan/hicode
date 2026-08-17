import type { CardView, RunView } from './types'

type FloorFields = Pick<CardView, 'cost_floor' | 'cost_unverified'>
type CostCard = Pick<CardView, 'cost_usd'> & FloorFields
type CostRun = Pick<RunView, 'cost_usd' | 'cost_measured'>

function splitProviders(raw: string): string[] {
  return [...new Set(raw.split(',').map((p) => p.trim()).filter(Boolean))]
}

export function floorProviders(card: FloorFields): string[] {
  return splitProviders(`${card.cost_floor},${card.cost_unverified}`)
}

export function isCostFloor(card: FloorFields): boolean {
  return floorProviders(card).length > 0
}

export function cardCostLabel(card: CostCard): string {
  return `${isCostFloor(card) ? '≥ ' : ''}$${card.cost_usd}`
}

export function cardFloorReason(card: FloorFields): string {
  const provedores = floorProviders(card)
  if (!provedores.length) return ''
  return `piso — sem reporte de gasto: ${provedores.join(', ')}; o total real deste card é maior que o mostrado`
}

export function runCostLabel(run: CostRun): string {
  return `${run.cost_measured === false ? '≥ ' : ''}$${Number(run.cost_usd || 0).toFixed(4)}`
}

export function runFloorReason(run: CostRun): string {
  return run.cost_measured === false
    ? 'piso — ao menos uma chamada desta execução terminou sem informar o gasto'
    : ''
}
