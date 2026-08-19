export const ENV_ROOT = 'HICODE_ROOT'
export const ENV_CARDS_DIR = 'HICODE_CARDS_DIR'
export const ENV_REPOS_FILE = 'HICODE_REPOS_FILE'
export const ENV_AGENTS_DIR = 'HICODE_AGENTS_DIR'
export const ENV_RUNNER_PIDFILE = 'HICODE_RUNNER_PIDFILE'
export const ENV_RUNNER_LOCK = 'HICODE_RUNNER_LOCK'
export const ENV_RUNNER_LOG = 'HICODE_RUNNER_LOG'
export const ENV_IA_FILE = 'HICODE_IA_FILE'
export const ENV_MODELOS_FILE = 'HICODE_MODELOS_FILE'

export type LadoDoContrato = 'motor' | 'painel' | 'ambos'

export interface VariavelDoContrato {
  readonly nome: string
  readonly precisaSerCompartilhadaEntreClones: boolean
  readonly resolvidoPor: readonly string[]
  readonly lado: LadoDoContrato
}

export const CONTRATO_MOTOR_PAINEL: readonly VariavelDoContrato[] = [
  { nome: ENV_ROOT, precisaSerCompartilhadaEntreClones: false, resolvidoPor: ['lib/runner/config.ts'], lado: 'ambos' },
  { nome: ENV_CARDS_DIR, precisaSerCompartilhadaEntreClones: true, resolvidoPor: ['lib/runner/config.ts'], lado: 'ambos' },
  { nome: ENV_REPOS_FILE, precisaSerCompartilhadaEntreClones: true, resolvidoPor: ['lib/runner/config.ts'], lado: 'ambos' },
  { nome: ENV_AGENTS_DIR, precisaSerCompartilhadaEntreClones: false, resolvidoPor: ['lib/ai/agentes-nexus.ts'], lado: 'motor' },
  { nome: ENV_RUNNER_PIDFILE, precisaSerCompartilhadaEntreClones: true, resolvidoPor: ['lib/core/daemon.ts', 'scripts/runner-daemon.sh'], lado: 'ambos' },
  { nome: ENV_RUNNER_LOCK, precisaSerCompartilhadaEntreClones: true, resolvidoPor: ['lib/runner/instance-lock.ts', 'scripts/runner-daemon.sh'], lado: 'ambos' },
  { nome: ENV_RUNNER_LOG, precisaSerCompartilhadaEntreClones: false, resolvidoPor: ['scripts/runner-daemon.sh'], lado: 'motor' },
  { nome: ENV_IA_FILE, precisaSerCompartilhadaEntreClones: true, resolvidoPor: ['lib/ai/preferencias.ts'], lado: 'ambos' },
  { nome: ENV_MODELOS_FILE, precisaSerCompartilhadaEntreClones: false, resolvidoPor: ['lib/ai/catalogo.ts'], lado: 'painel' },
]
