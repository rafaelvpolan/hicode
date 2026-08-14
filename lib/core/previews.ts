import type { Fields } from '../card/types'

export type SituacaoPorta = 'em-uso' | 'orfao' | 'morto'

export interface PortaPreview {
  porta: number
  cardId: string
  status: string
  pid: string
  url: string
  vivo: boolean
  situacao: SituacaoPorta
}

const TERMINAIS = ['MERGED', 'DEPLOYED']

export interface EntradaInventario {
  cards: Fields[]
  base: number
  vivo: (url: string) => boolean
}

function urlDe(base: number, id: string): string {
  return `http://localhost:${base + (Number(id) || 0)}`
}

export function inventario(e: EntradaInventario): PortaPreview[] {
  return e.cards
    .map((c): PortaPreview => {
      const id = String(c.id ?? '')
      const url = c.preview_url || urlDe(e.base, id)
      const status = String(c.status ?? '')
      const ativo = e.vivo(url)
      return {
        porta: Number(url.split(':').pop()) || 0,
        cardId: id,
        status,
        pid: String(c.preview_pid ?? ''),
        url,
        vivo: ativo,
        situacao: !ativo ? 'morto' : TERMINAIS.includes(status) ? 'orfao' : 'em-uso',
      }
    })
    .filter(p => p.vivo)
    .sort((a, b) => a.porta - b.porta)
}

export function orfaos(portas: PortaPreview[]): PortaPreview[] {
  return portas.filter(p => p.situacao === 'orfao')
}

export interface PlanoPreview {
  acao: 'reusar' | 'subir' | 'nada'
  url: string
  motivo: string
}

export interface EntradaGarantia {
  status: string
  worktree: string
  url: string
  vivo: boolean
  temDevServer: boolean
}

export function planejarPreview(e: EntradaGarantia): PlanoPreview {
  if (!e.temDevServer) return { acao: 'nada', url: '', motivo: 'o projeto nao tem dev server' }
  if (e.vivo) return { acao: 'reusar', url: e.url, motivo: 'ja esta no ar' }
  if (!e.worktree) return { acao: 'nada', url: '', motivo: 'a tarefa ainda nao tem worktree' }
  if (TERMINAIS.includes(e.status)) return { acao: 'nada', url: '', motivo: 'tarefa entregue' }
  return { acao: 'subir', url: e.url, motivo: 'servidor caido — subindo' }
}
