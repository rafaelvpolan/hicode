import { onBeforeUnmount, onMounted, reactive, ref, type Ref } from 'vue'
import type { GhRepoItem, RunView, StateResponse } from '#shared/types'

const POLL_INTERVAL_MS = 4000

export interface DashboardState {
  repos: StateResponse['repos']
  cards: StateResponse['cards']
  statuses: StateResponse['statuses']
}

export function useDashboard(): {
  state: DashboardState
  runs: Ref<RunView[]>
  gh: Ref<GhRepoItem[]>
  sprintRepo: Ref<string>
  load: () => Promise<void>
} {
  const state = reactive<DashboardState>({ repos: [], cards: [], statuses: [] })
  const runs = ref<RunView[]>([])
  const gh = ref<GhRepoItem[]>([])
  const sprintRepo = ref('')

  async function load(): Promise<void> {
    const s = await $fetch<StateResponse>('/api/state')
    Object.assign(state, s)
    if (!sprintRepo.value && state.repos[0]) sprintRepo.value = state.repos[0].name
    const r = await $fetch<{ runs: RunView[] }>('/api/runs')
    runs.value = r.runs || []
  }

  let timer: ReturnType<typeof setInterval> | null = null

  onMounted(async () => {
    await load()
    timer = setInterval(load, POLL_INTERVAL_MS)
  })

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
  })

  return { state, runs, gh, sprintRepo, load }
}
