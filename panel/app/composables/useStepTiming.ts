import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { CardStatus, CardView, RunView } from '#shared/types'
import { ACTIVE_STATUSES, PHASES, RESUME_STEP_BY_STATUS, phaseIdx, stClass, stepKeyForLabel } from './usePhases'
import { fmtTime } from './useFormat'

const TICK_MS = 1000

export interface StepTimingItem {
  status: CardStatus
  label: string
  cls: 'done' | 'now' | 'todo'
  resumeStep: string | null
  elapsedLabel: string
  estimateLabel: string
}

function ownCardEstimate(runs: RunView[], key: string): number | undefined {
  const samples = runs
    .map((r) => r.steps?.[key]?.time)
    .filter((t): t is number => typeof t === 'number' && t > 0)
  if (!samples.length) return undefined
  return Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
}

export function useStepTiming(
  card: Ref<CardView>,
  latestRun: ComputedRef<RunView | null>,
  cardRuns: ComputedRef<RunView[]>,
  estimates: ComputedRef<Record<string, number>>,
): ComputedRef<StepTimingItem[]> {
  const tick = ref(0)
  let timer: ReturnType<typeof setInterval> | null = null

  function stop(): void {
    if (timer) { clearInterval(timer); timer = null }
  }

  function start(): void {
    stop()
    timer = setInterval(() => { tick.value += 1 }, TICK_MS)
  }

  watch(() => ACTIVE_STATUSES.includes(card.value.status), (active) => (active ? start() : stop()), { immediate: true })
  onScopeDispose(stop)

  return computed<StepTimingItem[]>(() => {
    void tick.value
    const idx = phaseIdx(card.value.status)
    const isActive = ACTIVE_STATUSES.includes(card.value.status)
    return PHASES.map(([status, label], i) => {
      const cls = stClass(i, idx)
      const key = stepKeyForLabel(label)
      let elapsedLabel = ''
      if (key && cls === 'now' && isActive) {
        const secs = Math.max(0, Math.floor((Date.now() - Date.parse(card.value.updated)) / 1000))
        elapsedLabel = fmtTime(secs)
      } else if (key && cls !== 'todo') {
        const secs = latestRun.value?.steps?.[key]?.time
        if (secs) elapsedLabel = fmtTime(secs)
      }
      const estimateSecs = key ? (ownCardEstimate(cardRuns.value, key) ?? estimates.value[key]) : undefined
      const estimateLabel = estimateSecs ? `~${fmtTime(estimateSecs)}` : ''
      return { status, label, cls, resumeStep: RESUME_STEP_BY_STATUS[status] ?? null, elapsedLabel, estimateLabel }
    })
  })
}
