import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../runner/config'
import { memoArquivo } from '../core/cache'
import type { AgentRole } from './types'

export const ESFORCOS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Esforco = (typeof ESFORCOS)[number]

export interface PreferenciaDePapel {
  provider?: string
  model?: string
  effort?: string
}

export type PreferenciasDeIa = Partial<Record<AgentRole, PreferenciaDePapel>>

export function arquivoDePreferencias(): string {
  return process.env.HICODE_IA_FILE || join(ROOT, 'config', 'ia.json')
}

export function ehEsforco(valor: string | undefined): valor is Esforco {
  return !!valor && (ESFORCOS as readonly string[]).includes(valor)
}

function lerDoDisco(caminho: string): PreferenciasDeIa {
  if (!existsSync(caminho)) return {}
  try {
    const cru = JSON.parse(readFileSync(caminho, 'utf8')) as PreferenciasDeIa
    return cru && typeof cru === 'object' ? cru : {}
  } catch {
    return {}
  }
}

const lerMemorizado = memoArquivo(caminho => caminho, lerDoDisco)

export function preferencias(): PreferenciasDeIa {
  return lerMemorizado(arquivoDePreferencias())
}

export function preferenciaDoPapel(role: AgentRole): PreferenciaDePapel {
  return preferencias()[role] ?? {}
}

export function esforcoPara(role: AgentRole, doCard?: string): Esforco | undefined {
  const candidatos = [doCard, preferenciaDoPapel(role).effort, process.env.HICODE_EFFORT]
  for (const c of candidatos) if (ehEsforco(c)) return c
  return undefined
}
