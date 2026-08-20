import { statusCanonicoOuNulo } from '#shared/status'
import type { EventoDoQuadro, MotorAcompanharOptions, MotorDaemonStatus } from './types'
import { cardFiles, normalizeId, readCard } from '../card'
import { statusDoDaemon } from './disco'
import {
  esperar,
  lerEventosDeRuns,
  lerNovaPausa,
  lerNovasPerguntas,
  lerNovoFim,
  lerNovoVeredito,
  lerNovosEventosDoLog,
  novoEstado,
} from './eventos'
import type { EstadoDaLeitura } from './eventos'

const INTERVALO_DE_POLL_MS = 500

function idsDosCards(): string[] {
  const ids = new Set<string>()
  for (const arquivo of cardFiles()) {
    const id = normalizeId(arquivo.split('-')[0] ?? '')
    if (id) ids.add(id)
  }
  return [...ids]
}

function eventosDoCard(id: string, estado: EstadoDaLeitura): EventoDoQuadro[] {
  const brutos = [
    ...lerNovosEventosDoLog(id, estado),
    ...lerEventosDeRuns(id, estado),
    ...lerNovasPerguntas(id, estado),
    ...lerNovoVeredito(id, estado),
    ...lerNovaPausa(id, estado),
    ...lerNovoFim(id, estado),
  ]
  return brutos.map(evento => ({ ...evento, cardId: id }))
}

function eventoDeStatus(id: string, statusAnteriorPorCard: Map<string, string | null>): EventoDoQuadro | null {
  const atual = readCard(id)?.fm.status ?? ''
  const anterior = statusAnteriorPorCard.get(id)
  if (anterior === undefined) {
    statusAnteriorPorCard.set(id, atual)
    return null
  }
  if (atual === anterior) return null
  statusAnteriorPorCard.set(id, atual)
  const statusValido = statusCanonicoOuNulo(atual)
  if (!statusValido) return null
  return {
    tipo: 'status',
    ts: new Date().toISOString(),
    cardId: id,
    status: statusValido,
    statusAnterior: statusCanonicoOuNulo(anterior ?? undefined),
  }
}

function daemonMudou(anterior: MotorDaemonStatus | null, atual: MotorDaemonStatus): boolean {
  if (!anterior) return true
  return anterior.running !== atual.running || anterior.pid !== atual.pid || anterior.lockHeld !== atual.lockHeld
}

export async function* acompanharQuadro(options: MotorAcompanharOptions = {}): AsyncGenerator<EventoDoQuadro> {
  const estadosPorCard = new Map<string, EstadoDaLeitura>()
  const statusAnteriorPorCard = new Map<string, string | null>()
  let daemonAnterior: MotorDaemonStatus | null = null
  while (!options.signal?.aborted) {
    for (const id of idsDosCards()) {
      let estado = estadosPorCard.get(id)
      if (!estado) {
        estado = novoEstado(id)
        estadosPorCard.set(id, estado)
      }
      yield* eventosDoCard(id, estado)
      const eventoDeStatusDoCard = eventoDeStatus(id, statusAnteriorPorCard)
      if (eventoDeStatusDoCard) yield eventoDeStatusDoCard
    }
    const daemonAtual = statusDoDaemon()
    if (daemonMudou(daemonAnterior, daemonAtual)) {
      yield { tipo: 'daemon', ts: new Date().toISOString(), cardId: '', status: daemonAtual }
      daemonAnterior = daemonAtual
    }
    if (options.signal?.aborted) return
    await esperar(INTERVALO_DE_POLL_MS, options.signal)
  }
}
