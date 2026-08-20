import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import type {
  CardStatus,
  EventoDoQuadro,
  MotivoDePausa,
  MotorDaemonStatus,
  ResultadoDoFim,
} from '#shared/types'

const RECONEXAO_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const
const TENTATIVAS_ATE_DEGRADAR = 4
const URL_DO_FLUXO = '/api/motor/eventos'
const NOME_DO_EVENTO = 'evento'

export interface EstadoAoVivoDoCard {
  status: CardStatus | null
  statusAnterior: CardStatus | null
  etapaEmAndamento: string | null
  custoAcumuladoUsd: number | null
  custoMedido: boolean
  veredito: string | null
  vereditoMotivo: string
  motivoDePausa: MotivoDePausa | null
  motivoDeHalt: string | null
  resultadoFinal: ResultadoDoFim | null
  atualizadoEm: string
  versao: number
}

function estadoVazio(): EstadoAoVivoDoCard {
  return {
    status: null,
    statusAnterior: null,
    etapaEmAndamento: null,
    custoAcumuladoUsd: null,
    custoMedido: false,
    veredito: null,
    vereditoMotivo: '',
    motivoDePausa: null,
    motivoDeHalt: null,
    resultadoFinal: null,
    atualizadoEm: '',
    versao: 0,
  }
}

function aplicarEvento(atual: EstadoAoVivoDoCard, evento: EventoDoQuadro): EstadoAoVivoDoCard {
  const proximo: EstadoAoVivoDoCard = { ...atual, atualizadoEm: evento.ts, versao: atual.versao + 1 }
  switch (evento.tipo) {
    case 'passo_iniciado':
      proximo.etapaEmAndamento = evento.passo
      return proximo
    case 'passo_concluido':
      proximo.etapaEmAndamento = null
      proximo.custoAcumuladoUsd = (proximo.custoAcumuladoUsd ?? 0) + evento.custoUsd
      proximo.custoMedido = evento.custoMedido
      return proximo
    case 'custo':
      proximo.custoAcumuladoUsd = evento.acumuladoUsd
      return proximo
    case 'veredito':
      proximo.veredito = evento.veredito
      proximo.vereditoMotivo = evento.motivo
      return proximo
    case 'pausa':
      proximo.motivoDePausa = evento.motivo
      proximo.status = evento.status
      return proximo
    case 'halt':
      proximo.motivoDeHalt = evento.motivo
      return proximo
    case 'fim':
      proximo.resultadoFinal = evento.resultado
      proximo.custoAcumuladoUsd = evento.custoUsd
      return proximo
    case 'status':
      proximo.status = evento.status
      proximo.statusAnterior = evento.statusAnterior
      return proximo
    default:
      return proximo
  }
}

const porCard = ref<Map<string, EstadoAoVivoDoCard>>(new Map())
const daemon = ref<MotorDaemonStatus | null>(null)
const conectado = ref(false)
const reconectando = ref(false)
const degradado = ref(false)
const versaoGlobal = ref(0)

let fonte: EventSource | null = null
let timerDeReconexao: ReturnType<typeof setTimeout> | null = null
let tentativas = 0
let assinantes = 0

function atrasoDaProximaTentativa(): number {
  const indice = Math.min(tentativas, RECONEXAO_MS.length - 1)
  return RECONEXAO_MS[indice] ?? 30000
}

function limparTimer(): void {
  if (timerDeReconexao) {
    clearTimeout(timerDeReconexao)
    timerDeReconexao = null
  }
}

function processarEvento(dado: string): void {
  const evento = JSON.parse(dado) as EventoDoQuadro
  if (evento.tipo === 'daemon') {
    daemon.value = evento.status
    versaoGlobal.value += 1
    return
  }
  const mapa = porCard.value
  const atual = mapa.get(evento.cardId) ?? estadoVazio()
  mapa.set(evento.cardId, aplicarEvento(atual, evento))
  versaoGlobal.value += 1
}

function agendarReconexao(): void {
  limparTimer()
  reconectando.value = true
  tentativas += 1
  if (tentativas >= TENTATIVAS_ATE_DEGRADAR) degradado.value = true
  timerDeReconexao = setTimeout(conectar, atrasoDaProximaTentativa())
}

function conectar(): void {
  if (fonte) return
  const es = new EventSource(URL_DO_FLUXO)
  fonte = es

  es.addEventListener('open', () => {
    conectado.value = true
    reconectando.value = false
    degradado.value = false
    tentativas = 0
  })

  es.addEventListener(NOME_DO_EVENTO, (evento) => {
    const mensagem = evento as MessageEvent<string>
    processarEvento(mensagem.data)
  })

  es.addEventListener('heartbeat', () => {
    conectado.value = true
  })

  es.addEventListener('error', () => {
    es.close()
    fonte = null
    conectado.value = false
    agendarReconexao()
  })
}

function desconectar(): void {
  limparTimer()
  if (fonte) {
    fonte.close()
    fonte = null
  }
  conectado.value = false
  reconectando.value = false
}

export interface UseFluxoDoMotorReturn {
  porCard: Ref<Map<string, EstadoAoVivoDoCard>>
  daemon: Ref<MotorDaemonStatus | null>
  conectado: Ref<boolean>
  reconectando: Ref<boolean>
  degradado: Ref<boolean>
  versaoGlobal: Ref<number>
}

export function useFluxoDoMotor(): UseFluxoDoMotorReturn {
  onMounted(() => {
    assinantes += 1
    if (!fonte) conectar()
  })

  onBeforeUnmount(() => {
    assinantes -= 1
    if (assinantes <= 0) desconectar()
  })

  return { porCard, daemon, conectado, reconectando, degradado, versaoGlobal }
}
