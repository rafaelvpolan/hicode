import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AgentRole, Esforco, PreferenciaDePapel, PreferenciasDeIa } from './tipos'
import { ESFORCOS } from './tipos'
import { iaFile } from '../motor/ambiente'

export function ehEsforco(valor: string | undefined): valor is Esforco {
  return !!valor && (ESFORCOS as readonly string[]).includes(valor)
}

export function ler(): PreferenciasDeIa {
  const f = iaFile()
  if (!existsSync(f)) return {}
  try {
    const cru = JSON.parse(readFileSync(f, 'utf8')) as PreferenciasDeIa
    return cru && typeof cru === 'object' ? cru : {}
  } catch {
    return {}
  }
}

export function gravar(prefs: PreferenciasDeIa): void {
  const f = iaFile()
  const dir = dirname(f)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(f, `${JSON.stringify(prefs, null, 2)}\n`)
}

export function preferenciaDoPapel(role: AgentRole): PreferenciaDePapel {
  return ler()[role] ?? {}
}

export function esforcoPara(role: AgentRole, doCard?: string): Esforco | undefined {
  const candidatos = [doCard, preferenciaDoPapel(role).effort, process.env.HICODE_EFFORT]
  for (const c of candidatos) if (ehEsforco(c)) return c
  return undefined
}
