export interface CostReading {
  readonly cost: number
  readonly costMeasured: boolean
}

export const COST_UNKNOWN: CostReading = { cost: 0, costMeasured: false }

export const COST_FREE_LOCAL: CostReading = { cost: 0, costMeasured: true }

export function readReportedCost(reported: number | undefined): CostReading {
  if (typeof reported !== 'number' || !Number.isFinite(reported)) return COST_UNKNOWN
  return { cost: reported, costMeasured: true }
}
