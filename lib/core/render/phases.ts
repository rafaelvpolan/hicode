export interface Phase {
  label: string
  states: string[]
  color: string
}

export const PHASES: Phase[] = [
  { label: 'Fila', states: ['INBOX', 'READY', 'SPECCED', 'PLAN_APPROVED'], color: '\x1b[90m' },
  { label: 'Executar', states: ['EXECUTING', 'EXECUTED'], color: '\x1b[33m' },
  { label: 'Preview', states: ['PREVIEW', 'CORRECTING'], color: '\x1b[36m' },
  { label: 'Aprovado', states: ['PREVIEW_OK'], color: '\x1b[34m' },
  { label: 'Polir', states: ['REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED', 'CLEANED'], color: '\x1b[35m' },
  { label: 'PR', states: ['PR_OPEN', 'MERGED', 'DEPLOYED'], color: '\x1b[32m' },
]

export const WAITING_HUMAN = ['CLARIFY', 'PREVIEW', 'HALTED']

export function phaseIndex(status: string): number {
  return PHASES.findIndex(p => p.states.includes(status))
}

export function phaseLabel(status: string): string {
  return PHASES[phaseIndex(status)]?.label ?? status
}

export function isActive(status: string): boolean {
  return ['EXECUTING', 'CORRECTING', 'SPECCED', 'PREVIEW_OK', 'REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED', 'CLEANED'].includes(status)
}

export function waitsHuman(status: string): boolean {
  return WAITING_HUMAN.includes(status)
}

export interface EsperaHumano {
  motivo: string
  comando: string
}

const ESPERAS: Record<string, EsperaHumano> = {
  CLARIFY: { motivo: 'precisa da sua resposta', comando: '/ask' },
  PREVIEW: { motivo: 'preview pronto para ver', comando: '/ok' },
  READY: { motivo: 'plano nao aprovado', comando: '/plan' },
  INBOX: { motivo: 'plano nao aprovado', comando: '/plan' },
  SPECCED: { motivo: 'plano nao aprovado', comando: '/plan' },
  HALTED: { motivo: 'parou no meio', comando: '/plan' },
  PR_OPEN: { motivo: 'PR aberto para voce revisar', comando: '/plan' },
}

export function esperaHumano(status: string): EsperaHumano | null {
  return ESPERAS[status] ?? null
}
