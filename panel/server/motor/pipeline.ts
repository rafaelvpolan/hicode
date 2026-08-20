import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CardStatus, PipelineConfigResponse, PipelineStepView } from '#shared/types'
import { STATUSES } from '../card'
import { hiiHome } from './ambiente'

const MOTIVO_SOMENTE_LEITURA = 'o CLI do hii ainda nao expoe um verbo para alterar o pipeline (ex.: "hii pipeline set") — o painel so consegue ler config/pipeline.json; a escrita continua exclusiva do motor'

interface PipelineStepBruto {
  id?: string
  label?: string
  agent?: string
  state?: string
  gate?: string
  enabled?: boolean
  gated?: boolean
  needs?: string[]
}

interface PipelineConfigBruto {
  version?: number
  steps?: PipelineStepBruto[]
}

const STATUS_VALIDOS: ReadonlySet<string> = new Set(STATUSES)

const PASSOS_PADRAO: PipelineStepView[] = [
  { id: 'arquitetura', label: 'Arquitetura', agent: 'rufus', state: 'REFINED', gate: 'none', enabled: true, gated: true, needs: [] },
  { id: 'testes', label: 'Testes', agent: 'testudo', state: 'TESTS_GREEN', gate: 'test', enabled: true, gated: true, needs: ['arquitetura'] },
  { id: 'seguranca', label: 'Seguranca', agent: 'escudo', state: 'SEC_CLEARED', gate: 'none', enabled: true, gated: true, needs: ['arquitetura'] },
  { id: 'review', label: 'Review', agent: 'crivo', state: 'REVIEWED', gate: 'none', enabled: true, gated: false, needs: ['testes', 'seguranca'] },
  { id: 'limpeza', label: 'Limpeza', agent: 'pura', state: 'CLEANED', gate: 'none', enabled: true, gated: false, needs: ['review'] },
]

function ehStepValido(s: PipelineStepBruto): boolean {
  return !!(s && s.id && s.label && s.agent && s.state && STATUS_VALIDOS.has(s.state))
}

function paraView(s: PipelineStepBruto): PipelineStepView {
  return {
    id: s.id ?? '',
    label: s.label ?? '',
    agent: s.agent ?? '',
    state: (s.state ?? 'INBOX') as CardStatus,
    gate: s.gate ?? 'none',
    enabled: s.enabled !== false,
    gated: s.gated === true,
    needs: Array.isArray(s.needs) ? s.needs : [],
  }
}

function arquivoDePipeline(): string {
  return join(hiiHome(), 'config', 'pipeline.json')
}

function padrao(): PipelineConfigResponse {
  return { version: 1, steps: PASSOS_PADRAO, fonte: 'padrao-embutido', somenteLeitura: true, motivoSomenteLeitura: MOTIVO_SOMENTE_LEITURA }
}

export function pipelineAtual(): PipelineConfigResponse {
  const arquivo = arquivoDePipeline()
  if (!existsSync(arquivo)) return padrao()
  try {
    const bruto = JSON.parse(readFileSync(arquivo, 'utf8')) as PipelineConfigBruto
    if (!Array.isArray(bruto.steps)) return padrao()
    return {
      version: Number(bruto.version) || 1,
      steps: bruto.steps.filter(ehStepValido).map(paraView),
      fonte: 'config/pipeline.json',
      somenteLeitura: true,
      motivoSomenteLeitura: MOTIVO_SOMENTE_LEITURA,
    }
  } catch {
    return padrao()
  }
}
