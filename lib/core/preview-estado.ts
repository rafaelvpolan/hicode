import type { Fields } from '../card/types'

export type SituacaoPreview = 'no-ar' | 'parado' | 'futuro' | 'encerrado' | 'sem-superficie'

export interface EstadoPreview {
  situacao: SituacaoPreview
  url: string
  rotulo: string
  comando: string
}

const TERMINAIS = ['MERGED', 'DEPLOYED']
const ANTES_DE_EXECUTAR = ['INBOX', 'READY', 'CLARIFY', 'SPECCED', 'PLAN_APPROVED', 'PAUSED']

export interface EntradaPreview {
  status: string
  worktree: string
  url: string
  vivo: boolean
  temDevServer: boolean
}

export function daCard(card: Fields, url: string, vivo: boolean, temDevServer: boolean): EntradaPreview {
  return {
    status: card.status ?? 'INBOX',
    worktree: card.worktree ?? '',
    url,
    vivo,
    temDevServer,
  }
}

export function estadoDoPreview(e: EntradaPreview): EstadoPreview {
  const vazio = { url: '', comando: '' }
  if (!e.temDevServer) {
    return { ...vazio, situacao: 'sem-superficie', rotulo: 'o projeto nao tem dev server' }
  }
  if (e.vivo) {
    return { situacao: 'no-ar', url: e.url, rotulo: 'no ar agora', comando: '' }
  }
  if (TERMINAIS.includes(e.status)) {
    return { ...vazio, situacao: 'encerrado', rotulo: 'tarefa entregue — o preview foi encerrado' }
  }
  if (ANTES_DE_EXECUTAR.includes(e.status) || !e.worktree) {
    return { ...vazio, situacao: 'futuro', rotulo: 'sobe quando a tarefa executar' }
  }
  return { situacao: 'parado', url: e.url, rotulo: 'parado', comando: 'preview' }
}
