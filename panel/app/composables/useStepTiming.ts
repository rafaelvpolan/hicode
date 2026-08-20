import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { EstadoDeEtapa } from '#shared/design'
import type { CardStatus, CardView, RunView } from '#shared/types'
import { podeReexecutarEtapa, statusDoMotor } from '#shared/status'
import { ACTIVE_STATUSES, PHASES, RESUME_STEP_BY_STATUS, phaseIdx, stClass, stepKeyForLabel } from './usePhases'
import { fmtTime } from './useFormat'

const TICK_MS = 1000

export interface StepTimingItem {
  status: CardStatus
  label: string
  estado: EstadoDeEtapa
  resumeStep: string | null
  elapsedLabel: string
  estimateLabel: string
}

const ESTADO_POR_CLASSE: Record<'done' | 'now' | 'todo', EstadoDeEtapa> = {
  done: 'feito',
  now: 'agora',
  todo: 'pendente',
}

function ownCardEstimate(runs: RunView[], key: string): number | undefined {
  const samples = runs
    .map((r) => r.steps?.[key]?.time)
    .filter((t): t is number => typeof t === 'number' && t > 0)
  if (!samples.length) return undefined
  return Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
}

function ultimaFaseCronometrada(run: RunView | null): number {
  let ultima = -1
  PHASES.forEach(([, label], i) => {
    const key = stepKeyForLabel(label)
    const secs = key ? run?.steps?.[key]?.time : undefined
    if (typeof secs === 'number' && secs > 0) ultima = i
  })
  return ultima
}

export function useStepTiming(
  card: Ref<CardView>,
  latestRun: ComputedRef<RunView | null>,
  cardRuns: ComputedRef<RunView[]>,
  estimates: ComputedRef<Record<string, number>>,
  faseDaFalha: ComputedRef<CardStatus | null>,
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
    const parado = statusDoMotor(card.value.status) === 'HALTED'
    const declarado = phaseIdx(card.value.status)
    const registrada = faseDaFalha.value ? phaseIdx(faseDaFalha.value) : -1
    const cronometrada = ultimaFaseCronometrada(latestRun.value)
    const idx = parado ? registrada : declarado >= 0 ? declarado : cronometrada + 1
    const posicaoConhecida = parado ? registrada >= 0 : declarado >= 0 || cronometrada >= 0
    const isActive = ACTIVE_STATUSES.includes(card.value.status)
    const reexecutavel = podeReexecutarEtapa(card.value.status)
    return PHASES.map(([status, label], i) => {
      const cls = posicaoConhecida ? stClass(i, idx) : 'todo'
      const estado: EstadoDeEtapa = parado && cls === 'now' ? 'falhou' : ESTADO_POR_CLASSE[cls]
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
      const resumeStep = reexecutavel ? RESUME_STEP_BY_STATUS[status] ?? null : null
      return { status, label, estado, resumeStep, elapsedLabel, estimateLabel }
    })
  })
}
