export type CardStatus =
  | 'INBOX' | 'READY' | 'CLARIFY' | 'SPECCED' | 'PLAN_APPROVED' | 'EXECUTING' | 'PAUSED'
  | 'EXECUTED' | 'PREVIEW' | 'CORRECTING' | 'PREVIEW_OK' | 'REFINED' | 'TESTS_GREEN'
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
  halt_reason: string
  surface: string
  eval_score: string
  eval_notes: string
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
  estimates: Record<string, number>
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

export interface ReviewChangedFile {
  path: string
  status: string
  phase: string
}

export interface ReviewPreview {
  shot: boolean
  url: string
  running: boolean
}

export interface ReviewResponse {
  id: string
  status: CardStatus
  title: string
  desc: string
  branch: string
  pr_url: string
  source: 'wip' | 'pr' | 'none'
  preview: ReviewPreview
  verdict: string
  reason: string
  questions: string[]
  files: ReviewChangedFile[]
  correcting: boolean
  canCorrect: boolean
  error?: string
}

export interface FileDiffResponse {
  path: string
  status: string
  before: string
  after: string
  error?: string
}

export interface LogResponse {
  id: string
  log: string
  error?: string
}

export type AttemptKind = 'reprovacao' | 'correcao'

export interface Attempt {
  ts: string
  kind: AttemptKind
  reason: string
  response: string
}

export interface AttemptsResponse {
  id: string
  attempts: Attempt[]
}

export interface CorrectResponse {
  ok?: true
  error?: string
  card?: CardRecord
}

export interface ResetPreviewResponse {
  ok: true
  url: string
  running: boolean
  hard: boolean
}

export interface ClarifyQuestion {
  q: string
  options: string[]
  recommended: string
  answer?: string
}

export interface ClarifyResponse {
  id: string
  questions: ClarifyQuestion[]
}
