import type { Fields } from '../card/types'

export interface ProjetoConhecido {
  name: string
  registrado: boolean
}

export function projetosConhecidos(registrados: { name: string }[], cards: Fields[]): ProjetoConhecido[] {
  const nomes = registrados.map(r => r.name)
  const doRegistro = nomes.map((name): ProjetoConhecido => ({ name, registrado: true }))
  const orfaos = [...new Set(cards.map(c => String(c.repo ?? '')).filter(Boolean))]
    .filter(name => !nomes.includes(name))
    .sort()
    .map((name): ProjetoConhecido => ({ name, registrado: false }))
  return [...doRegistro, ...orfaos]
}
