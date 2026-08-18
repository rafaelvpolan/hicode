import { isoAt } from '../card'
import { loteDesde } from '../core/cota-runs'
import type { RegistroDeRun } from '../core/cota-runs'

export const JANELA_5H = 5 * 60 * 60 * 1000
export const JANELA_SEMANA = 7 * 24 * 60 * 60 * 1000

export interface ConsumoDoProvedor {
  provedor: string
  modelos: string[]
  runs: number
  falhas: number
  custoUsd: number
  tokensEntrada: number
  tokensSaida: number
  tokensCache: number
  tokensNaoSeparados: number
  tokens: number
  ultimoEm: string
}

interface Acumulado {
  consumo: ConsumoDoProvedor
  ultimoMs: number
}

function arredondar4(valor: number): number {
  return Number(valor.toFixed(4))
}

function naoNegativo(valor: number): number {
  return Number.isFinite(valor) && valor > 0 ? valor : 0
}

function custoDe(registro: RegistroDeRun): number {
  return naoNegativo(registro.custoUsd)
}

function inicioDaJanela(janelaMs: number, agoraMs: number): number {
  return agoraMs - naoNegativo(janelaMs)
}

function runsDaJanela(janelaMs: number, agoraMs: number): RegistroDeRun[] {
  const inicioMs = inicioDaJanela(janelaMs, agoraMs)
  return loteDesde(inicioMs).registros.filter(r => r.concluidoEmMs >= inicioMs)
}

function novoAcumulado(provedor: string): Acumulado {
  return {
    consumo: {
      provedor,
      modelos: [],
      runs: 0,
      falhas: 0,
      custoUsd: 0,
      tokensEntrada: 0,
      tokensSaida: 0,
      tokensCache: 0,
      tokensNaoSeparados: 0,
      tokens: 0,
      ultimoEm: '',
    },
    ultimoMs: Number.NEGATIVE_INFINITY,
  }
}

function somarTokens(c: ConsumoDoProvedor, registro: RegistroDeRun): void {
  const entrada = naoNegativo(registro.tokensEntrada)
  const saida = naoNegativo(registro.tokensSaida)
  const cache = naoNegativo(registro.tokensCache)
  const partes = entrada + saida + cache
  const total = naoNegativo(registro.tokens)
  c.tokensEntrada += entrada
  c.tokensSaida += saida
  c.tokensCache += cache
  c.tokensNaoSeparados += Math.max(0, total - partes)
  c.tokens += Math.max(total, partes)
}

function somarRun(acc: Acumulado, registro: RegistroDeRun): void {
  const c = acc.consumo
  c.runs += 1
  if (!registro.ok) c.falhas += 1
  c.custoUsd += custoDe(registro)
  somarTokens(c, registro)
  if (registro.modelo && !c.modelos.includes(registro.modelo)) c.modelos.push(registro.modelo)
  if (registro.concluidoEmMs > acc.ultimoMs) acc.ultimoMs = registro.concluidoEmMs
}

function fechar(acc: Acumulado): ConsumoDoProvedor {
  return {
    ...acc.consumo,
    custoUsd: arredondar4(acc.consumo.custoUsd),
    modelos: [...acc.consumo.modelos].sort(),
    ultimoEm: Number.isFinite(acc.ultimoMs) ? isoAt(acc.ultimoMs) : '',
  }
}

function porGastoDecrescente(a: ConsumoDoProvedor, b: ConsumoDoProvedor): number {
  return b.custoUsd - a.custoUsd || b.tokens - a.tokens || a.provedor.localeCompare(b.provedor)
}

export function consumoPorProvedor(janelaMs: number, agoraMs: number = Date.now()): ConsumoDoProvedor[] {
  const porProvedor = new Map<string, Acumulado>()
  for (const registro of runsDaJanela(janelaMs, agoraMs)) {
    const atual = porProvedor.get(registro.provedor) ?? novoAcumulado(registro.provedor)
    somarRun(atual, registro)
    porProvedor.set(registro.provedor, atual)
  }
  return [...porProvedor.values()].map(fechar).sort(porGastoDecrescente)
}

function indiceDoBalde(quandoMs: number, inicioMs: number, larguraMs: number, baldes: number): number {
  if (!(larguraMs > 0)) return baldes - 1
  const cru = Math.floor((quandoMs - inicioMs) / larguraMs)
  return Math.min(baldes - 1, Math.max(0, cru))
}

export function serieDeCusto(janelaMs: number, baldes: number, agoraMs: number = Date.now()): number[] {
  const quantos = Math.floor(baldes)
  if (!Number.isFinite(quantos) || quantos < 1) return []
  const inicioMs = inicioDaJanela(janelaMs, agoraMs)
  const larguraMs = naoNegativo(janelaMs) / quantos
  const serie = new Array<number>(quantos).fill(0)
  for (const registro of runsDaJanela(janelaMs, agoraMs)) {
    const i = indiceDoBalde(registro.concluidoEmMs, inicioMs, larguraMs, quantos)
    serie[i] = (serie[i] ?? 0) + custoDe(registro)
  }
  return serie.map(arredondar4)
}
