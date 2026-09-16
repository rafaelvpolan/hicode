/** Extensao independente dos enums da ponte HTTP v1. */
export const VERSAO = 1 as const
export type Estado = 'queued' | 'running' | 'waiting_human' | 'waiting_retry' | 'blocked' | 'succeeded' | 'failed' | 'cancelled' | 'skipped' | 'unknown'
export type Canal = 'stdout' | 'stderr' | 'assistant' | 'error'
export interface Escopo { repo: string; sessao: string; execucao: string }
export interface Recurso {
  id: string; namespace: string; nome: string
  tipo: 'orchestrator' | 'agent' | 'harness' | 'skill' | 'loop' | 'validation'
  origem: string; versao: string | null; capacidades: string[]
  observabilidade: 'instrumented' | 'partial' | 'unobservable'
}
export interface Medida { valor: number | null; fonte: string; instante: string; qualidade: 'measured' | 'unknown' | 'lower_bound' }
export interface Saida { sequencia: number; canal: Canal; texto: string; instante: string }
export interface Atividade extends Escopo {
  id: string; pai: string | null; recurso: Recurso; revisao: number; estado: Estado
  inicio: string; atualizado: string; heartbeat: string | null; fim: string | null
  etapa: string; tentativa: string; subsessao: string | null; microtask: string | null; planoRevisao: number | null
  detalhes: Record<string, string | number | boolean | null>
  metricas: { custoUsd: Medida; tokens: Medida; contextoTokens: Medida; quotaPercentual: Medida }
  saida: Saida[]; ultimaSequencia: number; truncado: boolean
  /** Identidade do processo observador, nunca argv/prompt. */
  dono: { pid: number; inicio: string }
}
export interface Evento { id: string; versao: 1; tipo: 'activity' | 'output'; atividade: Atividade }
export interface Snapshot { versao: 1; cursor: string; atividades: Atividade[]; degradado: boolean; motivo: string | null; proxima: string | null; retencao: { eventos: number; atividades: number; dias: number } }
export const terminal = (e: Estado): boolean => ['succeeded', 'failed', 'cancelled', 'skipped'].includes(e)
export function corresponde(a: Escopo, filtro: Partial<Escopo>): boolean {
  return (!filtro.repo || a.repo === filtro.repo) && (!filtro.sessao || a.sessao === filtro.sessao) && (!filtro.execucao || a.execucao === filtro.execucao)
}
