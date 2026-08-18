import { repoStatus } from '../../lib/core/repos'
import { renderProjetos, resumirProjetos } from '../../lib/core/render/board'
import { projetosConhecidos } from '../../lib/core/projetos-conhecidos'
import { todosOsCards } from './dados'

export const DIM = '\x1b[2m'
export const RESET = '\x1b[0m'
export const ACC = '\x1b[36m'
export const color = process.stdout.isTTY === true

export function say(s: string): void {
  process.stdout.write(s + '\n')
}

export function dim(s: string): string {
  return color ? `${DIM}${s}${RESET}` : s
}

export function projetos(): ReturnType<typeof resumirProjetos> {
  const cards = todosOsCards()
  const registro = repoStatus()
  const conhecidos = projetosConhecidos(registro, cards)
  const cloneDe = new Map(registro.map(r => [r.name, r.cloneOk]))
  return resumirProjetos(conhecidos.map(p => ({ name: p.name, cloneOk: cloneDe.get(p.name) ?? false })), cards)
}

export async function escolherProjeto(ask: (q: string) => Promise<string | null>): Promise<string> {
  const lista = projetos()
  if (!lista.length) return ''
  if (lista.length === 1) return lista[0]?.name ?? ''
  say('')
  say(renderProjetos(lista, { color }))
  say('')
  for (;;) {
    const r = await ask(color ? `${ACC}projeto› ${RESET}` : 'projeto› ')
    if (r === null) return lista[0]?.name ?? ''
    const t = r.trim()
    if (!t) return lista[0]?.name ?? ''
    const porNumero = lista[Number(t) - 1]
    if (porNumero) return porNumero.name
    const porNome = lista.find(p => p.name === t) ?? lista.find(p => p.name.includes(t))
    if (porNome) return porNome.name
    say(dim('  nao achei esse projeto — numero da lista ou parte do nome'))
  }
}
