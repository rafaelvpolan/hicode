import type { CardStatus } from './types'

export interface PipelineStepView {
  id: string
  label: string
  agent: string
  state: CardStatus
  gate: string
  enabled: boolean
  gated: boolean
  needs: string[]
}

export interface PipelineConfigResponse {
  version: number
  steps: PipelineStepView[]
  fonte: 'config/pipeline.json' | 'padrao-embutido'
  somenteLeitura: boolean
  motivoSomenteLeitura: string
}
