import { createHash } from 'node:crypto'
import type { RevisaoDePlanejamento, TarefaDeProduto } from '../../shared/planejamento'
import { estadoDaExecucao } from '../../shared/progresso-produto'
import type { ProgressoProduto } from '../../shared/progresso-produto'
import type { AvaliacaoDeExecucao } from '../../shared/avaliacao-hii'
import type { RevisaoTecnica } from '../../shared/tecnico'
import { analisarTecnico } from '../../shared/contrato-tecnico'
export async function progressoDaTarefa(
  p: RevisaoDePlanejamento, t: TarefaDeProduto, tecnico: RevisaoTecnica | null,
  avaliar: (id: string) => Promise<AvaliacaoDeExecucao>,
): Promise<ProgressoProduto> {
  const base: ProgressoProduto = { id: t.id, titulo: t.titulo, dependeDe: t.dependeDe,
    execucao: tecnico?.envio?.execucao || t.cardExistente || '', estado: 'sem_execucao',
    motivo: 'Nenhuma execucao vinculada a esta revisao.', avaliacao: null }
  if (tecnico && !tecnico.envio?.execucao) return { ...base, estado: 'revisao_pendente', motivo: tecnico.envio ? 'Envio ainda sem confirmacao; reconcilie no card tecnico.' : 'Revisao tecnica ainda nao despachada; evidencias antigas nao concluem esta revisao.' }
  if (!base.execucao) return t.dependeDe.length ? { ...base, estado: 'bloqueada', motivo: 'Dependencias de produto ainda precisam de conclusao verificavel antes do despacho.' } : base
  let a: AvaliacaoDeExecucao
  try { a = await avaliar(base.execucao) }
  catch { return { ...base, estado: 'inconclusiva', motivo: 'Motor indisponivel, tarefa ausente ou acesso recusado; nao foi possivel verificar.' } }
  if (a.versao !== 1 || a.repo !== p.documento.repo || a.execucao !== base.execucao) return { ...base, estado: 'inconclusiva', motivo: 'Resposta fora do escopo esperado.' }
  if (!a.plano || a.plano.produto !== t.id || a.plano.planejamento !== p.documento.id || a.plano.origemRevisao !== p.revisao) {
    return { ...base, avaliacao: a, estado: 'revisao_pendente', motivo: 'Execucao pertence a outro planejamento, produto ou revisao; confira o vinculo.' }
  }
  if (!tecnico?.aprovada) return { ...base, avaliacao: a, estado: 'inconclusiva', motivo: 'Vinculo informativo sem revisao tecnica aprovada para comprovar os criterios deste produto.' }
  const { documento: d, erros } = analisarTecnico(tecnico.fonte)
  const hash = createHash('sha256').update(tecnico.fonte.replace(/\r\n/g, '\n')).digest('hex')
  if (!d || erros.length || hash !== a.plano.tecnicoHash || d.origem.revisao !== p.revisao) {
    return { ...base, avaliacao: a, estado: 'revisao_pendente', motivo: 'Fonte tecnica diverge da revisao recebida pelo motor.' }
  }
  const cobertura = t.criterios.every((descricao, i) => {
    const c = d.criterios.find(c => c.id === `criterio-${i + 1}`)
    return !!c && c.obrigatorio && c.descricao === descricao && a.criterios.some(e => e.id === c.id && e.obrigatorio)
  })
  if (!cobertura) return { ...base, avaliacao: a, estado: 'inconclusiva', motivo: 'Criterios de produto nao estao integralmente vinculados aos criterios obrigatorios do plano.' }
  return { ...base, avaliacao: a, estado: estadoDaExecucao(a), motivo: a.motivo }
}
