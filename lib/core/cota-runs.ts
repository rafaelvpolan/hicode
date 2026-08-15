import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { FailureClass } from '../card'
import { cardsDir } from '../runner/config'
import { memoArquivo, memoChave, memoTempo } from './cache'

function ttlListagemMs(): number {
  return Number(process.env.HICODE_COTA_TTL_MS ?? '2000')
}

export const PROVEDOR_DESCONHECIDO = 'desconhecido'
export const JANELA_COTA_MS = 4 * 60 * 60 * 1000


const FOLGA_DO_NOME_MS = 60_000
const RE_ARQUIVO_DE_RUN = /^(\d+)-(\d{14})\.json$/

export interface RegistroDeRun {
  arquivo: string
  card: string
  concluidoEm: string
  concluidoEmMs: number
  ok: boolean
  custoUsd: number
  tokens: number
  provedor: string
  provedorIdentificado: boolean
  modelo: string
  classeDeFalha: FailureClass | ''
  motivoDaFalha: string
}

export interface LoteDeRuns {
  registros: RegistroDeRun[]
  ignorados: number
  desdeMs: number
}

interface RunEmDisco {
  id?: string
  ts?: string
  ok?: boolean
  cost_usd?: string
  tokens_total?: number
  tokens_in?: number
  tokens_out?: number
  tokens_cache_create?: number
  provider?: string
  model?: string
  failure_class?: string
  failure_reason?: string
}

const CLASSES_DE_FALHA: readonly FailureClass[] = ['transient', 'quota', 'terminal']

function runsDir(): string {
  return join(cardsDir(), 'runs')
}

export function instanteDoNome(nome: string): number {
  const digitos = RE_ARQUIVO_DE_RUN.exec(nome)?.[2]
  if (!digitos) return Number.NaN
  const d = digitos
  return Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}Z`)
}

function tokensDe(bruto: RunEmDisco): number {
  const total = Number(bruto.tokens_total) || 0
  if (total > 0) return total
  return (Number(bruto.tokens_in) || 0) + (Number(bruto.tokens_out) || 0) + (Number(bruto.tokens_cache_create) || 0)
}

function classeDeFalhaDe(bruto: string | undefined, ok: boolean): FailureClass | '' {
  if (ok) return ''
  return CLASSES_DE_FALHA.find(c => c === bruto) ?? ''
}

function instanteDoRegistro(bruto: RunEmDisco, nome: string): number {
  const carimbo = Date.parse(String(bruto.ts ?? ''))
  return Number.isFinite(carimbo) ? carimbo : instanteDoNome(nome)
}

function normalizar(caminho: string, bruto: RunEmDisco): RegistroDeRun | null {
  const nome = basename(caminho)
  const quando = instanteDoRegistro(bruto, nome)
  if (!Number.isFinite(quando)) return null
  const provedor = String(bruto.provider ?? '').trim()
  const ok = bruto.ok === true
  return {
    arquivo: nome,
    card: String(bruto.id ?? ''),
    concluidoEm: new Date(quando).toISOString().replace(/\.\d+Z$/, 'Z'),
    concluidoEmMs: quando,
    ok,
    custoUsd: parseFloat(String(bruto.cost_usd ?? '')) || 0,
    tokens: tokensDe(bruto),
    provedor: provedor || PROVEDOR_DESCONHECIDO,
    provedorIdentificado: provedor !== '',
    modelo: String(bruto.model ?? '').trim(),
    classeDeFalha: classeDeFalhaDe(bruto.failure_class, ok),
    motivoDaFalha: ok ? '' : String(bruto.failure_reason ?? ''),
  }
}

function lerRegistro(caminho: string): RegistroDeRun | null {
  try {
    return normalizar(caminho, JSON.parse(readFileSync(caminho, 'utf8')) as RunEmDisco)
  } catch {
    return null
  }
}

const registroDoArquivo = memoArquivo((caminho: string): string => caminho, lerRegistro)

function lerLoteDesde(pedidoMs: number): LoteDeRuns {
  const desdeMs = pedidoMs - FOLGA_DO_NOME_MS
  const dir = runsDir()
  if (!existsSync(dir)) return { registros: [], ignorados: 0, desdeMs }
  const registros: RegistroDeRun[] = []
  let ignorados = 0
  for (const nome of readdirSync(dir)) {
    if (!RE_ARQUIVO_DE_RUN.test(nome)) continue
    const doNome = instanteDoNome(nome)
    if (Number.isFinite(doNome) && doNome < desdeMs) continue
    const registro = registroDoArquivo(join(dir, nome))
    if (registro) registros.push(registro)
    else ignorados++
  }
  return { registros, ignorados, desdeMs }
}

function lerLoteDaJanelaAtual(): LoteDeRuns {
  return lerLoteDesde(Date.now() - JANELA_COTA_MS)
}

const lotePorDiretorio = memoChave(runsDir, (): (() => LoteDeRuns) => memoTempo(lerLoteDaJanelaAtual, ttlListagemMs()))

export function loteDesde(pedidoMs: number): LoteDeRuns {
  const guardado = lotePorDiretorio()()
  return pedidoMs >= guardado.desdeMs ? guardado : lerLoteDesde(pedidoMs)
}
