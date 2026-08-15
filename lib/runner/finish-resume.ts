import { isoNow } from '../card'
import { patchCard } from './card-store'
import type { PipelineStep } from './pipeline/types'

export const RESUME_POST_STEPS = '__apos_passos__'

export function resumeStart(steps: PipelineStep[], all: PipelineStep[], resumeFrom: string, id: string, profile: string): number {
  if (!resumeFrom) return 0
  const exact = steps.findIndex(s => s.label === resumeFrom)
  if (exact >= 0) return exact
  const wantPos = all.findIndex(s => s.label === resumeFrom)
  const mapped = wantPos < 0 ? -1 : steps.findIndex(s => all.findIndex(a => a.label === s.label) >= wantPos)
  patchCard(id, {}, `${isoNow()} replay: passo "${resumeFrom}" nao roda neste card (perfil ${profile}); ${mapped >= 0 ? 'retomando do passo aplicavel seguinte' : 'nada a repetir — seguindo para revalidacao/PR'}`)
  return mapped >= 0 ? mapped : steps.length
}
