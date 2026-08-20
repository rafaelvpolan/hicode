import type { CardStatus } from './types'

export const STATUSES: readonly CardStatus[] = [
  'INBOX', 'READY', 'CLARIFY', 'SPECCED', 'PLAN_APPROVED', 'EXECUTING', 'PAUSED', 'WAITING', 'EXECUTED',
  'PREVIEW', 'URL', 'CORRECTING', 'PREVIEW_OK', 'URL_OK', 'REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED',
  'CLEANED', 'PR_OPEN', 'MERGED', 'DEPLOYED', 'HALTED',
]

export function paraCardStatus(valor: string | undefined): CardStatus {
  return STATUSES.find((s) => s === valor) ?? 'INBOX'
}

const STATUS_LEGADO_PARA_MOTOR: Partial<Record<CardStatus, CardStatus>> = {
  PREVIEW: 'URL',
  PREVIEW_OK: 'URL_OK',
}

export const STATUS_URL_PENDENTE: CardStatus = 'URL'
export const STATUS_URL_APROVADA: CardStatus = 'URL_OK'

export function statusDoMotor(status: CardStatus): CardStatus {
  return STATUS_LEGADO_PARA_MOTOR[status] ?? status
}

export function statusCanonicoOuNulo(valor: string | undefined): CardStatus | null {
  const encontrado = STATUSES.find((s) => s === valor)
  return encontrado ? statusDoMotor(encontrado) : null
}

export function aguardaAprovacaoDeUrl(status: CardStatus): boolean {
  return statusDoMotor(status) === STATUS_URL_PENDENTE
}

export function urlAprovada(status: CardStatus): boolean {
  return statusDoMotor(status) === STATUS_URL_APROVADA
}

const STATUS_COM_URL_VIVA: CardStatus[] = ['EXECUTING', 'CORRECTING', 'URL', 'URL_OK']

export function temUrlViva(status: CardStatus): boolean {
  return STATUS_COM_URL_VIVA.includes(statusDoMotor(status))
}

const STATUS_REVISAVEIS: CardStatus[] = [
  'URL', 'CORRECTING', 'URL_OK', 'REFINED', 'TESTS_GREEN',
  'SEC_CLEARED', 'REVIEWED', 'CLEANED', 'PR_OPEN', 'MERGED',
]

export function statusEhRevisavel(status: CardStatus): boolean {
  return STATUS_REVISAVEIS.includes(statusDoMotor(status))
}

const STATUS_INICIAVEIS: CardStatus[] = ['INBOX', 'READY']

export function podeComecar(status: CardStatus): boolean {
  return STATUS_INICIAVEIS.includes(status)
}

const STATUS_BLOQUEADOS: CardStatus[] = ['HALTED', 'PAUSED', 'CORRECTING']

export function estaBloqueado(status: CardStatus): boolean {
  return STATUS_BLOQUEADOS.includes(status)
}

const STATUS_ENCERRADOS: CardStatus[] = ['PR_OPEN', 'MERGED', 'DEPLOYED']

export function estaEncerrado(status: CardStatus): boolean {
  return STATUS_ENCERRADOS.includes(statusDoMotor(status))
}

const STATUS_REEXECUTAVEIS: CardStatus[] = [
  'URL_OK', 'REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED', 'CLEANED', 'HALTED',
]

export function podeReexecutarEtapa(status: CardStatus): boolean {
  return STATUS_REEXECUTAVEIS.includes(statusDoMotor(status))
}
