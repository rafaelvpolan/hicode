import { padVisible } from '../../tui/layout'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const VERDE = '\x1b[32m'
const AMARELO = '\x1b[33m'
const VERMELHO = '\x1b[31m'

const CHEIO = '█'
const VAZIO = '░'
const LIMITE_ATENCAO = 0.6
const LIMITE_CRITICO = 0.85
const COLUNAS_PERCENTUAL = 4
const PERCENTUAL_MAXIMO_PARCIAL = 99

export type Severidade = 'ok' | 'atencao' | 'critico'

export interface OpcoesBarra {
  color: boolean
  largura: number
  mostrarPercentual?: boolean
}

const COR_DA_SEVERIDADE: Record<Severidade, string> = {
  ok: VERDE,
  atencao: AMARELO,
  critico: VERMELHO,
}

function paint(s: string, cor: string, o: { color: boolean }): string {
  return o.color && s ? `${cor}${s}${RESET}` : s
}

export function severidadeDe(fracao: number): Severidade {
  if (fracao >= LIMITE_CRITICO) return 'critico'
  if (fracao >= LIMITE_ATENCAO) return 'atencao'
  return 'ok'
}

function fracaoDe(valor: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  if (Number.isNaN(valor) || valor <= 0) return 0
  return Math.min(1, valor / total)
}

function colunasDe(pedido: number): number {
  if (!Number.isFinite(pedido)) return 0
  return Math.max(0, Math.trunc(pedido))
}

function cheiasDe(fracao: number, colunas: number): number {
  if (colunas <= 0 || fracao <= 0) return 0
  if (fracao >= 1) return colunas
  return Math.min(colunas - 1, Math.max(1, Math.round(fracao * colunas)))
}

function percentualDe(fracao: number): string {
  const inteiro = fracao >= 1
    ? 100
    : Math.min(PERCENTUAL_MAXIMO_PARCIAL, Math.round(fracao * 100))
  return `${inteiro}%`.padStart(COLUNAS_PERCENTUAL)
}

export function barra(valor: number, total: number, o: OpcoesBarra): string {
  const colunas = colunasDe(o.largura)
  const fracao = fracaoDe(valor, total)
  const cor = COR_DA_SEVERIDADE[severidadeDe(fracao)]
  const cheias = cheiasDe(fracao, colunas)
  const medidor = paint(CHEIO.repeat(cheias), cor, o)
    + paint(VAZIO.repeat(colunas - cheias), DIM, o)
  if (!o.mostrarPercentual) return medidor
  return `${medidor} ${paint(percentualDe(fracao), cor, o)}`
}

export function barraRotulada(
  rotulo: string,
  valor: number,
  total: number,
  o: OpcoesBarra & { rotuloEm: number },
): string {
  const colunas = colunasDe(o.rotuloEm)
  const medidor = barra(valor, total, o)
  if (colunas === 0) return medidor
  return `${paint(padVisible(rotulo, colunas), DIM, o)} ${medidor}`
}
