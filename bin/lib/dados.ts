import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cardsDir } from '../../lib/runner/config'
import { allCards, findCardFile, listRepos, normalizeId, readCard } from '../../lib/runner/card-store'
import { memoArquivo, memoTempo } from '../../lib/core/cache'
import { parseLog } from '../../lib/core/activity'
import { extractObjetivo } from '../../lib/card'
import type { Fields } from '../../lib/card'
import { planSteps } from '../../lib/runner/analyze'
import { activeSteps } from '../../lib/runner/pipeline/config'
import { readRunSteps } from '../../lib/runner/runs'
import { passosDoCard } from '../../lib/core/progresso'
import type { PipelineStep } from '../../lib/runner/pipeline/types'

export const atividadeDe = memoArquivo(
  (id) => join(cardsDir(), 'runs', `${normalizeId(id)}.live.log`),
  (id: string): ReturnType<typeof parseLog> => {
    try {
      return parseLog(readFileSync(join(cardsDir(), 'runs', `${normalizeId(id)}.live.log`), 'utf8'))
    } catch {
      return []
    }
  },
)

export const planoDoCard = memoArquivo(
  (id) => join(cardsDir(), findCardFile(id) ?? 'inexistente'),
  (id: string): PipelineStep[] => {
    const card = readCard(id)
    if (!card) return []
    const objetivo = extractObjetivo(card.body) || card.fm.title
    return planSteps(
      { title: card.fm.title, objetivo, risk: card.fm.risk, surface: card.fm.surface, override: card.fm.steps },
      passosAtivos(),
    ).steps
  },
)

export const passosAtivos = memoTempo(() => activeSteps(), 5000)
export const todosOsCards = memoTempo(() => allCards(), 250)
export const reposRegistrados = memoTempo(() => listRepos(), 2000)

export function passosDe(c: Fields): ReturnType<typeof passosDoCard> {
  const id = String(c.id ?? '')
  const steps = planoDoCard(id)
  if (!steps.length) return []
  return passosDoCard(c, steps, readRunSteps(id))
}

export function larguraUtil(): number {
  return Math.max(40, (Number(process.stdout.columns) || 78) - 6)
}
