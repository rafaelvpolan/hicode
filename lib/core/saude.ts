import type { Fields } from '../card'
import { isoAt } from '../card'
import { allCards } from '../runner/card-store'
import { maxWaitingAttempts } from '../runner/config'
import { backoffMsFor } from '../runner/failure-policy'
import { readDaemonHealth } from '../runner/health'
import { isActive } from './render/phases'
import { PROVEDOR_DESCONHECIDO, lerCota } from './cota'
import type { LeituraDeCota } from './cota'

export type EstadoDoMotor = 'tick-falhando' | 'cota-esgotada' | 'esperando-provedor' | 'trabalhando' | 'ocioso'

export interface EsperaPorFalha {
  card: string
  titulo: string
  provedor: string
  provedorIdentificado: boolean
  motivo: string
  tentativas: number
  maxTentativas: number
  esperandoDesde: string
  proximaTentativaEm: string
  atrasoMs: number
}

export interface ProvedorIndisponivel {
  provedor: string
  provedorIdentificado: boolean
  desde: string
  motivo: string
  cardsEsperando: string[]
  cardsParados: string[]
  limiteDeCota: boolean
}

export interface SaudeDoTick {
  falhasSeguidas: number
  ultimoErro: string
  ultimoErroEm: string
}

export interface SaudeDoMotor {
  estado: EstadoDoMotor
  esperas: EsperaPorFalha[]
  provedoresIndisponiveis: ProvedorIndisponivel[]
  paradosPorCota: string[]
  tick: SaudeDoTick
  cota: LeituraDeCota
}

function texto(fm: Fields, campo: string): string {
  return String(fm[campo] ?? '').trim()
}

function somaDosBackoffs(tentativas: number): number {
  let total = 0
  for (let i = 1; i <= tentativas; i += 1) total += backoffMsFor(i)
  return total
}

function inicioDaEsperaMs(fm: Fields, proximaMs: number, tentativas: number, agoraMs: number): number {
  const ancora = Number.isFinite(proximaMs) ? proximaMs : (Date.parse(texto(fm, 'updated')) || agoraMs)
  return Math.min(ancora - somaDosBackoffs(tentativas), agoraMs)
}

function esperaDoCard(fm: Fields, agoraMs: number): EsperaPorFalha {
  const provedor = texto(fm, 'wait_provider')
  const tentativas = Number(texto(fm, 'wait_attempts')) || 0
  const proximaMs = Date.parse(texto(fm, 'wait_until'))
  const valida = Number.isFinite(proximaMs)
  return {
    card: texto(fm, 'id'),
    titulo: texto(fm, 'title'),
    provedor: provedor || PROVEDOR_DESCONHECIDO,
    provedorIdentificado: provedor !== '',
    motivo: texto(fm, 'wait_reason'),
    tentativas,
    maxTentativas: maxWaitingAttempts(),
    esperandoDesde: isoAt(inicioDaEsperaMs(fm, proximaMs, tentativas, agoraMs)),
    proximaTentativaEm: valida ? isoAt(proximaMs) : '',
    atrasoMs: valida ? Math.max(0, agoraMs - proximaMs) : 0,
  }
}

function vazio(provedor: string, identificado: boolean): ProvedorIndisponivel {
  return { provedor, provedorIdentificado: identificado, desde: '', motivo: '', cardsEsperando: [], cardsParados: [], limiteDeCota: false }
}

function registrar(mapa: Map<string, ProvedorIndisponivel>, provedor: string, identificado: boolean): ProvedorIndisponivel {
  const atual = mapa.get(provedor) ?? vazio(provedor, identificado)
  mapa.set(provedor, atual)
  return atual
}

function anteciparDesde(alvo: ProvedorIndisponivel, quando: string, motivo: string): void {
  if (!quando) return
  if (!alvo.desde || quando < alvo.desde) {
    alvo.desde = quando
    if (motivo) alvo.motivo = motivo
  }
}

function porEsperas(mapa: Map<string, ProvedorIndisponivel>, esperas: EsperaPorFalha[]): void {
  for (const e of esperas) {
    const alvo = registrar(mapa, e.provedor, e.provedorIdentificado)
    alvo.cardsEsperando.push(e.card)
    anteciparDesde(alvo, e.esperandoDesde, e.motivo)
  }
}

function porHalts(mapa: Map<string, ProvedorIndisponivel>, cards: Fields[]): string[] {
  const paradosPorCota: string[] = []
  for (const fm of cards) {
    if (texto(fm, 'status') !== 'HALTED') continue
    const classe = texto(fm, 'halt_class')
    if (classe !== 'quota' && classe !== 'transient') continue
    const provedor = texto(fm, 'halt_provider')
    const alvo = registrar(mapa, provedor || PROVEDOR_DESCONHECIDO, provedor !== '')
    alvo.cardsParados.push(texto(fm, 'id'))
    if (classe === 'quota') {
      alvo.limiteDeCota = true
      paradosPorCota.push(texto(fm, 'id'))
    }
    anteciparDesde(alvo, texto(fm, 'halt_at') || texto(fm, 'updated'), texto(fm, 'halt_reason'))
  }
  return paradosPorCota
}

function porCota(mapa: Map<string, ProvedorIndisponivel>, cota: LeituraDeCota, haltados: Set<string>): string[] {
  const semMarcacao: string[] = []
  for (const uso of cota.provedores) {
    if (!uso.limiteAtingido) continue
    const alvo = registrar(mapa, uso.provedor, uso.provedorIdentificado)
    alvo.limiteDeCota = true
    anteciparDesde(alvo, uso.limiteAtingidoEm, uso.limiteMotivo)
    for (const card of uso.cardsNoLimite) {
      if (!haltados.has(card) || alvo.cardsParados.includes(card)) continue
      alvo.cardsParados.push(card)
      semMarcacao.push(card)
    }
  }
  return semMarcacao
}

function estadoMaisGrave(tick: SaudeDoTick, paradosPorCota: string[], esperas: EsperaPorFalha[], emVoo: boolean): EstadoDoMotor {
  if (tick.falhasSeguidas > 0) return 'tick-falhando'
  if (paradosPorCota.length) return 'cota-esgotada'
  if (esperas.length) return 'esperando-provedor'
  return emVoo ? 'trabalhando' : 'ocioso'
}

export function lerSaudeDoMotor(agoraMs: number = Date.now()): SaudeDoMotor {
  const cards = allCards()
  const cota = lerCota(agoraMs)
  const esperas = cards
    .filter(c => texto(c, 'status') === 'WAITING')
    .map(c => esperaDoCard(c, agoraMs))
    .sort((a, b) => Number(a.card) - Number(b.card))
  const mapa = new Map<string, ProvedorIndisponivel>()
  porEsperas(mapa, esperas)
  const haltados = new Set(cards.filter(c => texto(c, 'status') === 'HALTED').map(c => texto(c, 'id')))
  const marcados = porHalts(mapa, cards)
  const paradosPorCota = [...new Set([...marcados, ...porCota(mapa, cota, haltados)])]
  const daemon = readDaemonHealth()
  const tick: SaudeDoTick = {
    falhasSeguidas: daemon.consecutiveFailures,
    ultimoErro: daemon.lastError,
    ultimoErroEm: daemon.lastErrorAt,
  }
  const emVoo = cards.some(c => {
    const status = texto(c, 'status')
    return status !== 'WAITING' && isActive(status)
  })
  return {
    estado: estadoMaisGrave(tick, paradosPorCota, esperas, emVoo),
    esperas,
    provedoresIndisponiveis: [...mapa.values()].sort((a, b) => a.provedor.localeCompare(b.provedor)),
    paradosPorCota,
    tick,
    cota,
  }
}
