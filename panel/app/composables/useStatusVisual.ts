import type { Tom } from '#shared/design'
import type { CardStatus, EstadoDeServico } from '#shared/types'

const TOM_POR_STATUS: Record<CardStatus, Tom> = {
  INBOX: 'neutro',
  READY: 'neutro',
  CLARIFY: 'atencao',
  SPECCED: 'rodando',
  PLAN_APPROVED: 'rodando',
  EXECUTING: 'rodando',
  PAUSED: 'parado',
  WAITING: 'atencao',
  EXECUTED: 'rodando',
  PREVIEW: 'atencao',
  URL: 'atencao',
  CORRECTING: 'rodando',
  PREVIEW_OK: 'rodando',
  URL_OK: 'rodando',
  REFINED: 'rodando',
  TESTS_GREEN: 'rodando',
  SEC_CLEARED: 'rodando',
  REVIEWED: 'rodando',
  CLEANED: 'rodando',
  PR_OPEN: 'ok',
  MERGED: 'ok',
  DEPLOYED: 'ok',
  HALTED: 'falha',
}

const TOM_POR_ESTADO_DE_SERVICO: Record<EstadoDeServico, Tom> = {
  ok: 'ok',
  atencao: 'atencao',
  erro: 'falha',
  desconhecido: 'parado',
}

const TOM_POR_RESULTADO: Record<string, Tom> = {
  sucesso: 'ok',
  falha: 'falha',
  desconhecido: 'parado',
}

export function tomDeStatus(status: CardStatus): Tom {
  return TOM_POR_STATUS[status]
}

export function tomDeServico(estado: EstadoDeServico): Tom {
  return TOM_POR_ESTADO_DE_SERVICO[estado] ?? 'parado'
}

export function tomDeResultado(resultado: string): Tom {
  return TOM_POR_RESULTADO[resultado] ?? 'parado'
}

export function tomDeRisco(risco: string): Tom {
  return risco === 'high' ? 'atencao' : 'neutro'
}
