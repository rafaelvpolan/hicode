import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { StepMetric } from '#shared/types'
import { cardsDir } from './ambiente'

export interface IaContribuidaEmDisco {
  provedor: string
  modelo: string
  custoUsd: number
  custoMedido: boolean
  tokens: number
  chamadas: number
  falhas: number
}

export interface ExecucaoEmDisco {
  arquivo: string
  cardId: string
  ts: string
  tsMs: number
  ok: boolean
  custoUsd: number
  custoMedido: boolean
  tokensTotal: number
  duracaoS: number
  provider: string
  model: string
  failureClass: string
  failureReason: string
  steps: Record<string, StepMetric> | null
  tipo: 'execucao' | 'conversa'
  ias: IaContribuidaEmDisco[]
}

export interface LoteDeExecucoes {
  execucoes: ExecucaoEmDisco[]
  ignorados: number
}

interface IaBrutaEmDisco {
  provedor?: string
  modelo?: string
  custoUsd?: number
  custoMedido?: boolean
  tokens?: number
  chamadas?: number
  falhas?: number
}

interface RunBrutoEmDisco {
  id?: string
  ts?: string
  ok?: boolean
  cost_usd?: string
  tokens_total?: number
  tokens_in?: number
  tokens_out?: number
  tokens_cache_create?: number
  duration_s?: number
  provider?: string
  model?: string
  failure_class?: string
  failure_reason?: string
  cost_measured?: boolean
  steps?: Record<string, StepMetric>
  kind?: 'execucao' | 'conversa'
  ias?: IaBrutaEmDisco[]
}

const RE_ARQUIVO_DE_RUN = /^\d+-(\d{14})\.json$/
const RE_ARQUIVO_DE_CONVERSA = /^conversa-(\d{14})-\d+\.json$/

export function ehArquivoDeSessao(nome: string): boolean {
  return RE_ARQUIVO_DE_RUN.test(nome) || RE_ARQUIVO_DE_CONVERSA.test(nome)
}

function digitosDoNome(nome: string): string {
  return RE_ARQUIVO_DE_RUN.exec(nome)?.[1] ?? RE_ARQUIVO_DE_CONVERSA.exec(nome)?.[1] ?? ''
}

function instanteDoNome(nome: string): number {
  const d = digitosDoNome(nome)
  if (!d) return Number.NaN
  return Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}Z`)
}

function instanteDoRegistro(bruto: RunBrutoEmDisco, nome: string): number {
  const doCarimbo = Date.parse(String(bruto.ts ?? ''))
  return Number.isFinite(doCarimbo) ? doCarimbo : instanteDoNome(nome)
}

function tokensTotalDe(bruto: RunBrutoEmDisco): number {
  const total = Number(bruto.tokens_total) || 0
  if (total > 0) return total
  return (Number(bruto.tokens_in) || 0) + (Number(bruto.tokens_out) || 0) + (Number(bruto.tokens_cache_create) || 0)
}

function runsDir(): string {
  return join(cardsDir(), 'runs')
}

const FOLGA_DO_NOME_MS = 60_000

function dentroDaJanela(nome: string, desdeMs: number): boolean {
  if (desdeMs <= 0) return true
  const doNome = instanteDoNome(nome)
  return !Number.isFinite(doNome) || doNome >= desdeMs - FOLGA_DO_NOME_MS
}

function iasDe(bruto: RunBrutoEmDisco): IaContribuidaEmDisco[] {
  if (!Array.isArray(bruto.ias)) return []
  return bruto.ias.map(ia => ({
    provedor: String(ia.provedor ?? '').trim(),
    modelo: String(ia.modelo ?? '').trim(),
    custoUsd: Number(ia.custoUsd) || 0,
    custoMedido: ia.custoMedido !== false,
    tokens: Number(ia.tokens) || 0,
    chamadas: Number(ia.chamadas) || 0,
    falhas: Number(ia.falhas) || 0,
  }))
}

function normalizar(arquivo: string, bruto: RunBrutoEmDisco): ExecucaoEmDisco | null {
  const tsMs = instanteDoRegistro(bruto, arquivo)
  if (!Number.isFinite(tsMs)) return null
  return {
    arquivo,
    cardId: String(bruto.id ?? '').trim(),
    ts: bruto.ts || new Date(tsMs).toISOString(),
    tsMs,
    ok: bruto.ok === true,
    custoUsd: parseFloat(String(bruto.cost_usd ?? '0')) || 0,
    custoMedido: bruto.cost_measured !== false,
    tokensTotal: tokensTotalDe(bruto),
    duracaoS: Number(bruto.duration_s) || 0,
    provider: String(bruto.provider ?? '').trim(),
    model: String(bruto.model ?? '').trim(),
    failureClass: String(bruto.failure_class ?? ''),
    failureReason: String(bruto.failure_reason ?? ''),
    steps: bruto.steps ?? null,
    tipo: bruto.kind === 'conversa' ? 'conversa' : 'execucao',
    ias: iasDe(bruto),
  }
}

function lerArquivo(caminho: string, arquivo: string): ExecucaoEmDisco | null {
  try {
    return normalizar(arquivo, JSON.parse(readFileSync(caminho, 'utf8')) as RunBrutoEmDisco)
  } catch {
    return null
  }
}

export function lerExecucoes(desdeMs = 0): LoteDeExecucoes {
  const dir = runsDir()
  if (!existsSync(dir)) return { execucoes: [], ignorados: 0 }
  const nomes = readdirSync(dir).filter(ehArquivoDeSessao).filter(nome => dentroDaJanela(nome, desdeMs))
  const execucoes: ExecucaoEmDisco[] = []
  let ignorados = 0
  for (const nome of nomes) {
    const execucao = lerArquivo(join(dir, nome), nome)
    if (execucao) execucoes.push(execucao)
    else ignorados++
  }
  return { execucoes, ignorados }
}
