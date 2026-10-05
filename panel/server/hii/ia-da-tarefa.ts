import type { PapelHii } from '../../shared/configuracao-hii'

export interface EscolhaDeIa { papel: PapelHii; provedor: string; modelo?: string }
interface Bruto { papel?: string; provedor?: string; modelo?: string }

const PAPEIS: readonly PapelHii[] = ['implement', 'verify', 'gate', 'step']

export function escolhaDeIa(b: Bruto): EscolhaDeIa | string {
  const papel = PAPEIS.find(p => p === b.papel)
  if (!papel) return 'Papel invalido'
  if (typeof b.provedor !== 'string' || b.provedor.length > 64 || !/^[a-z0-9._-]*$/.test(b.provedor)) return 'IA invalida'
  if (b.modelo !== undefined && (typeof b.modelo !== 'string' || b.modelo.length > 200)) return 'Modelo invalido'
  return { papel, provedor: b.provedor, ...(typeof b.modelo === 'string' && b.modelo ? { modelo: b.modelo } : {}) }
}
