import { extractObjetivo } from '../card'
import { estadoDoPreview } from './preview-estado'
import type { Card } from '../card'
import { planSteps } from '../runner/analyze'
import { classifySurface } from '../runner/classify'
import { activeSteps } from '../runner/pipeline/config'
import { waves } from '../runner/pipeline/waves'
import type { PipelineStep } from '../runner/pipeline/types'

export interface PlanWave {
  n: number
  steps: PipelineStep[]
}

export interface PlanFlags {
  on: boolean
  reason: string
}

export interface Plan {
  previewUrl: string
  previewAtivo: boolean
  previewRotulo: string
  previewComando: string
  id: string
  title: string
  objetivo: string
  repo: string
  profile: string
  profileReason: string
  layout: PlanFlags
  pilha: PlanFlags
  waves: PlanWave[]
  skipped: string[]
  gatedLabels: string[]
}

export interface PlanInput {
  card: Card
  hasDevServer: boolean
  fileCount?: number
  sliceLimit?: number
  previewUrl?: string
  previewAtivo?: boolean
}

const SUBJETIVO = /\b(?:melhor\w*|chamativ\w*|bonit\w*|moderniz\w*|refin\w*|aparencia|estil\w*|design|visual\w*|layout|ux)\b/

function norm(s: string | undefined): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function layoutFlag(card: Card, surfaceVisual: boolean, objetivo: string): PlanFlags {
  if (card.fm.layout === 'on') return { on: true, reason: 'ligado no card' }
  if (card.fm.layout === 'off') return { on: false, reason: 'desligado no card' }
  if (!surfaceVisual) return { on: false, reason: 'tarefa sem superficie visual' }
  const m = ` ${norm(card.fm.title)} ${norm(objetivo)} `.match(SUBJETIVO)
  return m?.[0]
    ? { on: false, reason: `visual subjetivo ("${m[0]}") — sugerido, ligue com layout: on` }
    : { on: false, reason: 'visual localizado — layout nao ajuda' }
}

function pilhaFlag(card: Card, fileCount: number, limit: number): PlanFlags {
  if (card.fm.pilha === 'on') return { on: true, reason: 'ligado no card' }
  if (fileCount > limit) return { on: false, reason: `${fileCount} arquivos > teto ${limit} — sugerido, ligue com pilha: on` }
  return { on: false, reason: `${fileCount} arquivo(s), teto ${limit}` }
}

export function buildPlan(input: PlanInput): Plan {
  const { card } = input
  const objetivo = extractObjetivo(card.body) || card.fm.title || ''
  const surface = card.fm.surface || classifySurface(card.fm.title ?? '', objetivo, input.hasDevServer).surface
  const all = activeSteps()
  const plan = planSteps(
    { title: card.fm.title, objetivo, risk: card.fm.risk, surface, override: card.fm.steps },
    all,
  )
  const preview = estadoDoPreview({
    status: card.fm.status ?? 'INBOX',
    worktree: card.fm.worktree ?? '',
    url: input.previewUrl ?? '',
    vivo: !!input.previewAtivo,
    temDevServer: input.hasDevServer,
  })
  return {
    previewUrl: preview.url,
    previewAtivo: preview.situacao === 'no-ar',
    previewRotulo: preview.situacao === 'sem-superficie' ? '' : preview.rotulo,
    previewComando: preview.comando ? `/${preview.comando} ${Number(card.fm.id)}` : '',
    id: card.fm.id ?? '',
    title: card.fm.title ?? '',
    objetivo,
    repo: card.fm.repo ?? '',
    profile: plan.profile,
    profileReason: plan.reason,
    layout: layoutFlag(card, surface === 'visual', objetivo),
    pilha: pilhaFlag(card, input.fileCount ?? 0, input.sliceLimit ?? 30),
    waves: waves(plan.steps).map((steps, i) => ({ n: i + 1, steps })),
    skipped: plan.skipped,
    gatedLabels: plan.steps.filter(s => s.gated).map(s => s.label),
  }
}
