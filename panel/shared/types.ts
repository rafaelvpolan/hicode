export type CardStatus =
  | 'INBOX' | 'READY' | 'SPECCED' | 'PLAN_APPROVED' | 'EXECUTING' | 'PAUSED'
  | 'EXECUTED' | 'PREVIEW' | 'PREVIEW_OK' | 'REFINED' | 'TESTS_GREEN'
  | 'SEC_CLEARED' | 'REVIEWED' | 'CLEANED' | 'PR_OPEN' | 'MERGED' | 'DEPLOYED' | 'HALTED'

export type CardRisk = 'low' | 'high'

export interface CardView {
  id: string
  slug: string
  title: string
  status: CardStatus
  risk: CardRisk
  repo: string
  updated: string
  desc: string
  cost_usd: string
  tokens_total: string
  verify: string
  revalidacao: string
  preview_url: string
  pr_url: string
  shot: boolean
}

export interface RepoView {
  name: string
  url: string
  branch: string
  runCmd: string
  added: string
}

export interface StepMetric {
  time: number
  cost: number
  tokens: number
}

export interface RunView {
  id: string
  ts: string
  title: string
  tokens_total: number
  cost_usd: number
  duration_s: number
  steps?: Record<string, StepMetric>
}

export interface Kpi {
  l: string
  v: string
  k: '' | 'ok' | 'warn' | 'bad'
}

export interface StateResponse {
  repos: RepoView[]
  cards: CardView[]
  statuses: CardStatus[]
}

export interface RunsResponse {
  runs: RunView[]
}

export interface GhRepoItem {
  nameWithOwner: string
  description: string
  url: string
  visibility: string
}

export interface GhReposResponse {
  items: GhRepoItem[]
  error?: string
}

export interface ApiError {
  error: string
}

export interface OkResponse {
  ok: true
}

export interface AddRepoResponse {
  ok?: true
  error?: string
  repos?: RepoView[]
}

export interface CardRecord extends Record<string, string> {
  file: string
}

export interface CardActionResponse {
  ok?: true
  error?: string
  card?: CardRecord
}

export interface CreateSprintResponse {
  ok: true
  created: number
  cards: CardView[]
}

export interface ProjectPreviewResponse {
  url: string
  running: boolean
  started?: boolean
  source?: 'wip' | 'main'
  branch?: string
  cardId?: string
  error?: string
}

export interface NewRepoForm {
  name: string
  url: string
  branch: string
  runCmd: string
}

export interface EditingForm {
  open: boolean
  id: string
  title: string
  desc: string
  risk: CardRisk
  note: string
}

export interface ProjectPreviewState {
  url: string
  msg: string
}
