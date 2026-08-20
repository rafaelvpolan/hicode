import { onMounted, onBeforeUnmount, watch, type Ref } from 'vue'
import type { CardStatus, CardView, GhRepoItem, RepoView, RunView, RunsResponse, StateResponse } from '#shared/types'
import { useFluxoDoMotor } from './useFluxoDoMotor'

const INTERVALO_MS = 20000

export interface UseDashboardReturn {
  repos: Ref<RepoView[]>
  cards: Ref<CardView[]>
  statuses: Ref<CardStatus[]>
  runs: Ref<RunView[]>
  estimates: Ref<Record<string, number>>
  gh: Ref<GhRepoItem[]>
  sprintRepo: Ref<string>
  erro: Ref<string>
  load: () => Promise<void>
}

let assinantes = 0
let timer: ReturnType<typeof setInterval> | null = null

export function useDashboard(): UseDashboardReturn {
  const repos = useState<RepoView[]>('painel-repos', () => [])
  const cards = useState<CardView[]>('painel-cards', () => [])
  const statuses = useState<CardStatus[]>('painel-statuses', () => [])
  const runs = useState<RunView[]>('painel-runs', () => [])
  const estimates = useState<Record<string, number>>('painel-estimates', () => ({}))
  const gh = useState<GhRepoItem[]>('painel-gh', () => [])
  const sprintRepo = useState<string>('painel-sprint-repo', () => '')
  const erro = useState<string>('painel-erro', () => '')

  const { porCard, versaoGlobal, conectado } = useFluxoDoMotor()

  function aplicarStatusAoVivo(): void {
    for (const card of cards.value) {
      const estado = porCard.value.get(card.id)
      if (estado?.status && estado.status !== card.status) card.status = estado.status
    }
  }

  async function load(): Promise<void> {
    try {
      const s = await $fetch<StateResponse>('/api/state')
      repos.value = s.repos
      cards.value = s.cards
      statuses.value = s.statuses
      if (!sprintRepo.value && s.repos[0]) sprintRepo.value = s.repos[0].name
      const r = await $fetch<RunsResponse>('/api/runs')
      runs.value = r.runs || []
      estimates.value = r.estimates || {}
      erro.value = ''
    } catch (e) {
      erro.value = e instanceof Error ? e.message : String(e)
    }
  }

  watch(versaoGlobal, aplicarStatusAoVivo)
  watch(conectado, (agora, antes) => { if (agora && !antes) void load() })

  onMounted(async () => {
    assinantes += 1
    await load()
    if (!timer) timer = setInterval(load, INTERVALO_MS)
  })

  onBeforeUnmount(() => {
    assinantes -= 1
    if (assinantes <= 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  })

  return { repos, cards, statuses, runs, estimates, gh, sprintRepo, erro, load }
}
