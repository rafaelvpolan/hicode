import { isoAt } from '../card'
import { JANELA_COTA_MS, PROVEDOR_DESCONHECIDO, loteDesde } from './cota-runs'
import type { RegistroDeRun } from './cota-runs'

export { JANELA_COTA_MS, PROVEDOR_DESCONHECIDO }
export type { RegistroDeRun }

export interface UsoDoProvedor {
  provedor: string
  provedorIdentificado: boolean
  runs: number
  runsComFalha: number
  custoUsd: number
  tokens: number
  modelos: string[]
  primeiroEm: string
  ultimoEm: string
  janelaViraEm: string
  janelaViraDaquiMs: number
  limiteAtingido: boolean
  limiteAtingidoEm: string
  limiteMotivo: string
  cardsNoLimite: string[]
}

export interface LeituraDeCota {
  agora: string
  janelaMs: number
  inicioDaJanela: string
  provedores: UsoDoProvedor[]
  custoUsd: number
  tokens: number
  runs: number
  runsIgnorados: number
  janelaViraEm: string
  janelaViraDaquiMs: number
  limiteAtingido: boolean
}

interface Acumulador {
  uso: UsoDoProvedor
  primeiroMs: number
  ultimoMs: number
  limiteMs: number
}

function novoAcumulador(registro: RegistroDeRun): Acumulador {
  return {
    uso: {
      provedor: registro.provedor,
      provedorIdentificado: registro.provedorIdentificado,
      runs: 0,
      runsComFalha: 0,
      custoUsd: 0,
      tokens: 0,
      modelos: [],
      primeiroEm: '',
      ultimoEm: '',
      janelaViraEm: '',
      janelaViraDaquiMs: 0,
      limiteAtingido: false,
      limiteAtingidoEm: '',
      limiteMotivo: '',
      cardsNoLimite: [],
    },
    primeiroMs: Number.POSITIVE_INFINITY,
    ultimoMs: Number.NEGATIVE_INFINITY,
    limiteMs: Number.NEGATIVE_INFINITY,
  }
}

function anotarLimite(acc: Acumulador, registro: RegistroDeRun): void {
  if (registro.classeDeFalha !== 'quota') return
  acc.uso.limiteAtingido = true
  if (registro.card && !acc.uso.cardsNoLimite.includes(registro.card)) acc.uso.cardsNoLimite.push(registro.card)
  if (registro.concluidoEmMs < acc.limiteMs) return
  acc.limiteMs = registro.concluidoEmMs
  acc.uso.limiteAtingidoEm = registro.concluidoEm
  acc.uso.limiteMotivo = registro.motivoDaFalha
}

function acumular(acc: Acumulador, registro: RegistroDeRun): void {
  acc.uso.runs += 1
  if (!registro.ok) acc.uso.runsComFalha += 1
  acc.uso.custoUsd += registro.custoUsd
  acc.uso.tokens += registro.tokens
  if (registro.modelo && !acc.uso.modelos.includes(registro.modelo)) acc.uso.modelos.push(registro.modelo)
  acc.primeiroMs = Math.min(acc.primeiroMs, registro.concluidoEmMs)
  acc.ultimoMs = Math.max(acc.ultimoMs, registro.concluidoEmMs)
  anotarLimite(acc, registro)
}

function fechar(acc: Acumulador, agoraMs: number): UsoDoProvedor {
  const viraMs = acc.primeiroMs + JANELA_COTA_MS
  return {
    ...acc.uso,
    custoUsd: Number(acc.uso.custoUsd.toFixed(4)),
    modelos: [...acc.uso.modelos].sort(),
    primeiroEm: isoAt(acc.primeiroMs),
    ultimoEm: isoAt(acc.ultimoMs),
    janelaViraEm: isoAt(viraMs),
    janelaViraDaquiMs: Math.max(0, viraMs - agoraMs),
  }
}

function porGasto(a: UsoDoProvedor, b: UsoDoProvedor): number {
  return b.custoUsd - a.custoUsd || b.tokens - a.tokens || a.provedor.localeCompare(b.provedor)
}

function agrupar(registros: RegistroDeRun[]): Map<string, Acumulador> {
  const porProvedor = new Map<string, Acumulador>()
  for (const registro of registros) {
    const atual = porProvedor.get(registro.provedor) ?? novoAcumulador(registro)
    acumular(atual, registro)
    porProvedor.set(registro.provedor, atual)
  }
  return porProvedor
}

function somar(provedores: UsoDoProvedor[], campo: (u: UsoDoProvedor) => number): number {
  return provedores.reduce((total, u) => total + campo(u), 0)
}

export function lerCota(agoraMs: number = Date.now()): LeituraDeCota {
  const inicioMs = agoraMs - JANELA_COTA_MS
  const lote = loteDesde(inicioMs)
  const naJanela = lote.registros.filter(r => r.concluidoEmMs >= inicioMs)
  const provedores = [...agrupar(naJanela).values()].map(acc => fechar(acc, agoraMs)).sort(porGasto)
  const proximaVirada = provedores.reduce((menor, u) => Math.min(menor, u.janelaViraDaquiMs), Number.POSITIVE_INFINITY)
  const virandoEm = provedores.find(u => u.janelaViraDaquiMs === proximaVirada)
  return {
    agora: isoAt(agoraMs),
    janelaMs: JANELA_COTA_MS,
    inicioDaJanela: isoAt(inicioMs),
    provedores,
    custoUsd: Number(somar(provedores, u => u.custoUsd).toFixed(4)),
    tokens: somar(provedores, u => u.tokens),
    runs: naJanela.length,
    runsIgnorados: lote.ignorados,
    janelaViraEm: virandoEm?.janelaViraEm ?? '',
    janelaViraDaquiMs: virandoEm?.janelaViraDaquiMs ?? 0,
    limiteAtingido: provedores.some(u => u.limiteAtingido),
  }
}
