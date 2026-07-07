import type { Status } from '../../card'

export type StepKind = 'quality' | 'security' | 'review' | 'cleanup' | 'custom'

export type GateKind = 'none' | 'test' | 'verdict'

export interface PipelineStep {
  id: string
  label: string
  kind: StepKind
  agent: string
  state: Status
  gate: GateKind
  enabled: boolean
  instruction: string
}

export interface PipelineConfig {
  version: number
  steps: PipelineStep[]
}
