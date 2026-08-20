import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { CardStatus, ClarifyQuestion, StepMetric } from '#shared/types'
import type { EventoDoMotor, MotivoDePausa, MotorAcompanharOptions, ResultadoDoFim } from './types'
import { statusCanonicoOuNulo } from '#shared/status'
import { cardsDir } from './ambiente'
import { normalizeId, readCard } from '../card'

const INTERVALO_DE_POLL_MS = 500

const RE_CHAMADA_DE_FERRAMENTA = /^\s*→\s*([A-Za-z_][\w.-]*)\((.*)$/
const RE_RESULTADO_DE_FERRAMENTA = /^\s*←\s*(.*)$/
const RE_CONCLUIDO = /^—\s*concluido \(custo \$([0-9.]+)\)/
const RE_TIMEOUT = /^—\s*TIMEOUT/

const STATUS_FIM_SUCESSO: Set<CardStatus> = new Set(['PR_OPEN', 'MERGED', 'DEPLOYED'])
const STATUS_FIM_FALHA: Set<CardStatus> = new Set(['HALTED'])
const MOTIVO_DE_PAUSA: ReadonlyMap<CardStatus, MotivoDePausa> = new Map([
  ['URL', 'aguardando_aprovacao_url'],
  ['CLARIFY', 'pergunta_aberta'],
  ['PAUSED', 'pausa_manual'],
])
interface ChamadaPendente {
  ts: string
  ferramenta: string
  entrada: string
}

export interface AssinaturaDeArquivo {
  mtimeMs: number
  size: number
}

export interface EstadoDaLeitura {
  offsetDoLog: number
  chamadaPendente: ChamadaPendente | null
  custoAcumuladoUsd: number
  baseUsdDoCard: number
  ultimoAcumuladoUsd: number
  assinaturaDaMetricaEmitidaPorArquivo: Map<string, Map<string, string>>
  assinaturaPorArquivo: Map<string, AssinaturaDeArquivo>
  perguntasVistas: Set<string>
  ultimoStatus: string | null
  ultimoStatusPausa: string | null
  ultimoVeredito: string | null
}

function runsDir(): string {
  return join(cardsDir(), 'runs')
}

function liveLogPath(cardId: string): string {
  return join(runsDir(), `${cardId}.live.log`)
}

function clarifyPath(cardId: string): string {
  return join(runsDir(), `${cardId}.clarify.json`)
}

function custoUsdDoCard(cardId: string): number {
  const custo = Number(readCard(cardId)?.fm.cost_usd ?? '')
  return Number.isFinite(custo) ? custo : 0
}

function tamanhoDoArquivo(caminho: string): number {
  try {
    return readFileSync(caminho, 'utf8').length
  } catch {
    return 0
  }
}

export function novoEstado(cardId: string): EstadoDaLeitura {
  const id = normalizeId(cardId)
  return {
    offsetDoLog: tamanhoDoArquivo(liveLogPath(id)),
    chamadaPendente: null,
    custoAcumuladoUsd: 0,
    baseUsdDoCard: custoUsdDoCard(id),
    ultimoAcumuladoUsd: 0,
    assinaturaDaMetricaEmitidaPorArquivo: new Map(),
    assinaturaPorArquivo: new Map(),
    perguntasVistas: new Set(),
    ultimoStatus: null,
    ultimoStatusPausa: null,
    ultimoVeredito: null,
  }
}

export function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (!signal) { setTimeout(resolve, ms); return }
    const t = setTimeout(() => {
      signal.removeEventListener('abort', aoAbortar)
      resolve()
    }, ms)
    const aoAbortar = (): void => {
      clearTimeout(t)
      resolve()
    }
    signal.addEventListener('abort', aoAbortar, { once: true })
  })
}

function acumularCusto(estado: EstadoDaLeitura, usd: number): number {
  estado.custoAcumuladoUsd += usd
  return estado.custoAcumuladoUsd
}

function acumuladoUsdMonotonico(estado: EstadoDaLeitura, cardId: string, somaDoLog: number): number {
  const candidato = Math.max(estado.baseUsdDoCard + somaDoLog, custoUsdDoCard(cardId))
  estado.ultimoAcumuladoUsd = Math.max(estado.ultimoAcumuladoUsd, candidato)
  return estado.ultimoAcumuladoUsd
}

function flusharChamadaPendente(estado: EstadoDaLeitura, resultado: string | null, eventos: EventoDoMotor[]): void {
  if (!estado.chamadaPendente) return
  const { ts, ferramenta, entrada } = estado.chamadaPendente
  eventos.push({ tipo: 'saida_de_ferramenta', ts, ferramenta, entrada, resultado })
  estado.chamadaPendente = null
}

function processarLinhaDoLog(cardId: string, linha: string, estado: EstadoDaLeitura, eventos: EventoDoMotor[]): void {
  if (!linha.trim()) return
  const ts = new Date().toISOString()
  if (RE_TIMEOUT.test(linha)) {
    flusharChamadaPendente(estado, null, eventos)
    eventos.push({ tipo: 'halt', ts, motivo: 'timeout: a IA foi encerrada por exceder o tempo limite da chamada' })
    return
  }
  const concluido = linha.match(RE_CONCLUIDO)
  if (concluido) {
    flusharChamadaPendente(estado, null, eventos)
    const usd = Number(concluido[1]) || 0
    const somaDoLog = acumularCusto(estado, usd)
    eventos.push({ tipo: 'custo', ts, usd, acumuladoUsd: acumuladoUsdMonotonico(estado, cardId, somaDoLog) })
    return
  }
  const chamada = linha.match(RE_CHAMADA_DE_FERRAMENTA)
  if (chamada) {
    flusharChamadaPendente(estado, null, eventos)
    estado.chamadaPendente = { ts, ferramenta: chamada[1] ?? '', entrada: chamada[2] ?? '' }
    return
  }
  const resultado = linha.match(RE_RESULTADO_DE_FERRAMENTA)
  if (resultado) {
    flusharChamadaPendente(estado, resultado[1] ?? '', eventos)
  }
}

export function lerNovosEventosDoLog(cardId: string, estado: EstadoDaLeitura): EventoDoMotor[] {
  const id = normalizeId(cardId)
  const caminho = liveLogPath(id)
  if (!existsSync(caminho)) return []
  const conteudo = readFileSync(caminho, 'utf8')
  if (conteudo.length < estado.offsetDoLog) {
    estado.offsetDoLog = conteudo.length
    return []
  }
  const novo = conteudo.slice(estado.offsetDoLog)
  if (!novo) return []
  const fimDaUltimaLinhaCompleta = novo.lastIndexOf('\n')
  if (fimDaUltimaLinhaCompleta < 0) return []
  const linhas = novo.slice(0, fimDaUltimaLinhaCompleta).split('\n')
  estado.offsetDoLog += fimDaUltimaLinhaCompleta + 1
  const eventos: EventoDoMotor[] = []
  for (const linha of linhas) processarLinhaDoLog(id, linha, estado, eventos)
  return eventos
}

interface ResumoDeRunEmDisco {
  ts?: string
  steps: Record<string, StepMetric> | null
}

function lerResumoDeRun(caminho: string): ResumoDeRunEmDisco | null {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8')) as ResumoDeRunEmDisco
  } catch {
    return null
  }
}

function ehArquivoDeRunDoCard(cardId: string, arquivo: string): boolean {
  return arquivo.startsWith(`${cardId}-`) && arquivo.endsWith('.json')
}

export function assinaturaMudou(caminho: string, anterior: AssinaturaDeArquivo | undefined): AssinaturaDeArquivo | null {
  let stats: { mtimeMs: number; size: number }
  try {
    stats = statSync(caminho)
  } catch {
    return null
  }
  const atual: AssinaturaDeArquivo = { mtimeMs: stats.mtimeMs, size: stats.size }
  if (anterior && anterior.mtimeMs === atual.mtimeMs && anterior.size === atual.size) return null
  return atual
}

function passoRealmenteRodou(metrica: StepMetric): boolean {
  return metrica.costMeasured !== undefined || metrica.time !== 0 || metrica.cost !== 0 || metrica.tokens !== 0
}

function assinaturaDaMetrica(metrica: StepMetric): string {
  return `${metrica.time}|${metrica.cost}|${metrica.tokens}|${metrica.costMeasured}`
}

function eventosDoResumo(resumo: ResumoDeRunEmDisco, assinaturaEmitidaPorPasso: Map<string, string>): EventoDoMotor[] {
  const ts = resumo.ts ?? new Date().toISOString()
  const eventos: EventoDoMotor[] = []
  for (const [passo, metrica] of Object.entries(resumo.steps ?? {})) {
    if (!metrica || !passoRealmenteRodou(metrica)) continue
    const assinatura = assinaturaDaMetrica(metrica)
    if (assinaturaEmitidaPorPasso.get(passo) === assinatura) continue
    assinaturaEmitidaPorPasso.set(passo, assinatura)
    eventos.push({ tipo: 'passo_iniciado', ts, passo })
    eventos.push({
      tipo: 'passo_concluido',
      ts,
      passo,
      custoUsd: metrica.cost,
      custoMedido: metrica.costMeasured === true,
      tokens: metrica.tokens,
      duracaoS: metrica.time,
    })
  }
  return eventos
}

export function lerEventosDeRuns(cardId: string, estado: EstadoDaLeitura): EventoDoMotor[] {
  const id = normalizeId(cardId)
  const dir = runsDir()
  if (!existsSync(dir)) return []
  const arquivos = readdirSync(dir).filter(f => ehArquivoDeRunDoCard(id, f)).sort()
  const eventos: EventoDoMotor[] = []
  for (const arquivo of arquivos) {
    const caminho = join(dir, arquivo)
    const atual = assinaturaMudou(caminho, estado.assinaturaPorArquivo.get(arquivo))
    if (!atual) continue
    estado.assinaturaPorArquivo.set(arquivo, atual)
    let assinaturaEmitidaPorPasso = estado.assinaturaDaMetricaEmitidaPorArquivo.get(arquivo)
    if (!assinaturaEmitidaPorPasso) {
      assinaturaEmitidaPorPasso = new Map()
      estado.assinaturaDaMetricaEmitidaPorArquivo.set(arquivo, assinaturaEmitidaPorPasso)
    }
    const resumo = lerResumoDeRun(caminho)
    if (resumo) eventos.push(...eventosDoResumo(resumo, assinaturaEmitidaPorPasso))
  }
  return eventos
}

function lerClarify(caminho: string): ClarifyQuestion[] {
  try {
    const parsed = JSON.parse(readFileSync(caminho, 'utf8')) as ClarifyQuestion[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function lerNovasPerguntas(cardId: string, estado: EstadoDaLeitura): EventoDoMotor[] {
  const id = normalizeId(cardId)
  const caminho = clarifyPath(id)
  if (!existsSync(caminho)) return []
  const ts = new Date().toISOString()
  const eventos: EventoDoMotor[] = []
  for (const questao of lerClarify(caminho)) {
    if (questao.answer || estado.perguntasVistas.has(questao.q)) continue
    estado.perguntasVistas.add(questao.q)
    eventos.push({ tipo: 'pergunta', ts, pergunta: questao.q, opcoes: questao.options, recomendada: questao.recommended })
  }
  return eventos
}

function resultadoDoStatus(status: CardStatus): ResultadoDoFim | null {
  if (STATUS_FIM_SUCESSO.has(status)) return 'sucesso'
  if (STATUS_FIM_FALHA.has(status)) return 'falha'
  return null
}

export function lerNovoFim(cardId: string, estado: EstadoDaLeitura): EventoDoMotor[] {
  const id = normalizeId(cardId)
  const card = readCard(id)
  const statusBruto = card?.fm.status ?? ''
  if (statusBruto === estado.ultimoStatus) return []
  estado.ultimoStatus = statusBruto
  const status = statusCanonicoOuNulo(statusBruto)
  const resultado = status ? resultadoDoStatus(status) : null
  if (!resultado) return []
  const custoUsd = Number(card?.fm.cost_usd ?? '0') || 0
  return [{ tipo: 'fim', ts: new Date().toISOString(), resultado, custoUsd }]
}

export function lerNovaPausa(cardId: string, estado: EstadoDaLeitura): EventoDoMotor[] {
  const id = normalizeId(cardId)
  const card = readCard(id)
  const statusBruto = card?.fm.status ?? ''
  if (statusBruto === estado.ultimoStatusPausa) return []
  estado.ultimoStatusPausa = statusBruto
  const status = statusCanonicoOuNulo(statusBruto)
  const motivo = status ? MOTIVO_DE_PAUSA.get(status) : undefined
  if (!motivo || !status) return []
  return [{ tipo: 'pausa', ts: new Date().toISOString(), motivo, status }]
}

export function lerNovoVeredito(cardId: string, estado: EstadoDaLeitura): EventoDoMotor[] {
  const id = normalizeId(cardId)
  const card = readCard(id)
  const veredito = card?.fm.review_verdict ?? ''
  if (!veredito || veredito === estado.ultimoVeredito) return []
  estado.ultimoVeredito = veredito
  return [{ tipo: 'veredito', ts: new Date().toISOString(), veredito, motivo: card?.fm.review_reason ?? '' }]
}

export async function* acompanharDoDisco(cardId: string, options: MotorAcompanharOptions = {}): AsyncGenerator<EventoDoMotor> {
  const id = normalizeId(cardId)
  const estado = novoEstado(id)
  while (!options.signal?.aborted) {
    yield* lerNovosEventosDoLog(id, estado)
    yield* lerEventosDeRuns(id, estado)
    yield* lerNovasPerguntas(id, estado)
    yield* lerNovoVeredito(id, estado)
    yield* lerNovaPausa(id, estado)
    yield* lerNovoFim(id, estado)
    if (options.signal?.aborted) return
    await esperar(INTERVALO_DE_POLL_MS, options.signal)
  }
}
