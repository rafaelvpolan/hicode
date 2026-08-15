import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { Fields } from '../card'
import { cardsDir } from '../runner/config'
import { allCards, cardFiles, findCardFile, normalizeId } from '../runner/card-store'

export const MAX_CARDS = Number(process.env.HICODE_MAX_CARDS || 10)

const TERMINAIS = ['MERGED', 'DEPLOYED']

export function archiveDir(): string {
  return join(cardsDir(), 'archive')
}

export interface Arquivado {
  id: string
  title: string
  status: string
  repo: string
  file: string
}

export interface PorProjeto {
  repo: string
  total: number
  movidos: Arquivado[]
  acimaDoTeto: number
}

export interface ArquivoResultado {
  projetos: PorProjeto[]
  movidos: Arquivado[]
}

function agrupar(cards: Array<Fields & { file: string }>): Map<string, Array<Fields & { file: string }>> {
  const m = new Map<string, Array<Fields & { file: string }>>()
  for (const c of cards) {
    const repo = String(c.repo ?? '')
    const lista = m.get(repo) ?? []
    lista.push(c)
    m.set(repo, lista)
  }
  return m
}

function comoArquivado(c: Fields & { file: string }): Arquivado {
  return {
    id: String(c.id ?? ''),
    title: String(c.title ?? ''),
    status: String(c.status ?? ''),
    repo: String(c.repo ?? ''),
    file: c.file,
  }
}

export function planejar(limite = MAX_CARDS): PorProjeto[] {
  return [...agrupar(allCards()).entries()].map(([repo, cards]) => {
    const excedente = Math.max(0, cards.length - limite)
    const terminais = cards
      .filter(c => TERMINAIS.includes(String(c.status ?? '')))
      .sort((a, b) => String(a.updated ?? '').localeCompare(String(b.updated ?? '')))
    const movidos = terminais.slice(0, excedente).map(comoArquivado)
    return {
      repo,
      total: cards.length,
      movidos,
      acimaDoTeto: Math.max(0, cards.length - movidos.length - limite),
    }
  }).sort((a, b) => a.repo.localeCompare(b.repo))
}

export function arquivar(limite = MAX_CARDS): ArquivoResultado {
  const projetos = planejar(limite)
  const movidos = projetos.flatMap(p => p.movidos)
  if (movidos.length) {
    const destino = archiveDir()
    if (!existsSync(destino)) mkdirSync(destino, { recursive: true })
    for (const c of movidos) {
      const origem = join(cardsDir(), c.file)
      if (existsSync(origem)) renameSync(origem, join(destino, c.file))
    }
  }
  return { projetos, movidos }
}

export function listarArquivados(): string[] {
  const d = archiveDir()
  if (!existsSync(d)) return []
  return readdirSync(d).filter(f => f.endsWith('.md')).sort()
}

export function restaurar(id: string): boolean {
  const alvo = normalizeId(id)
  const arquivo = listarArquivados().find(f => f.startsWith(`${alvo}-`))
  if (!arquivo) return false
  if (findCardFile(alvo)) return false
  renameSync(join(archiveDir(), arquivo), join(cardsDir(), arquivo))
  return true
}

export function precisaArquivar(limite = MAX_CARDS): boolean {
  if (cardFiles().length <= limite) return false
  return planejar(limite).some(p => p.movidos.length > 0)
}
