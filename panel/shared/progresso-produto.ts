import type { AvaliacaoDeExecucao } from './avaliacao-hii'
export type EstadoProduto = 'sem_execucao' | 'em_execucao' | 'bloqueada' | 'interrompida' | 'falhou' | 'aguarda_revisao' | 'concluida' | 'inconclusiva' | 'revisao_pendente'
export interface ProgressoProduto {
  id: string; titulo: string; dependeDe: string[]; execucao: string; estado: EstadoProduto; motivo: string
  avaliacao: AvaliacaoDeExecucao | null
}
export interface PaginaDeProgresso {
  versao: 1; repo: string; planejamento: string; revisao: number; total: number
  tarefas: ProgressoProduto[]; proxima: number | null; consultadaEm: string
}
export const ROTULOS_PRODUTO: Record<EstadoProduto, string> = {
  sem_execucao: 'Sem execucao', em_execucao: 'Em execucao', bloqueada: 'Bloqueada',
  interrompida: 'Interrompida', falhou: 'Falhou', aguarda_revisao: 'Aguarda revisao',
  concluida: 'Concluida com evidencia', inconclusiva: 'Verificacao inconclusiva', revisao_pendente: 'Nova revisao pendente',
}
export function estadoDaExecucao(a: AvaliacaoDeExecucao): EstadoProduto {
  const verificada = a.modo === 'passivo' && a.atualidade === 'atual' && a.criteriosAprovados &&
    a.criterios.some(c => c.obrigatorio) && a.criterios.every(c => !c.obrigatorio || c.estado === 'aprovado')
  if (a.status === 'HALTED') return 'interrompida'
  if (['INBOX', 'READY', 'CLARIFY', 'PAUSED', 'WAITING', 'CONFIRM'].includes(a.status)) return 'bloqueada'
  if (a.atualidade === 'atual' && a.criterios.some(c => c.obrigatorio && c.estado === 'reprovado')) return 'falhou'
  if (['MERGED', 'DEPLOYED'].includes(a.status)) return verificada ? 'concluida' : 'inconclusiva'
  if (a.status === 'PR_OPEN') return verificada ? 'aguarda_revisao' : 'inconclusiva'
  if (a.status === 'COMPLETED' || !a.status) return 'inconclusiva'
  return ['EXECUTING', 'EXECUTED', 'URL', 'CORRECTING', 'URL_OK', 'REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED', 'CLEANED'].includes(a.status) ? 'em_execucao' : 'inconclusiva'
}
export function conclusaoDoEpico(tarefas: ProgressoProduto[], total: number): boolean {
  if (!total || tarefas.length !== total || new Set(tarefas.map(t => t.id)).size !== total) return false
  const concluidas = new Set(tarefas.filter(t => t.estado === 'concluida').map(t => t.id))
  if (concluidas.size !== total || !tarefas.every(t => t.dependeDe.every(id => concluidas.has(id)))) return false
  const vistas = new Set<string>()
  while (vistas.size < total) {
    const prontas = tarefas.filter(t => !vistas.has(t.id) && t.dependeDe.every(id => vistas.has(id)))
    if (!prontas.length) return false
    prontas.forEach(t => vistas.add(t.id))
  }
  return true
}
