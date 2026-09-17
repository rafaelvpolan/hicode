import { serializarTecnico } from './contrato-tecnico'
import type { DocumentoTecnico } from './contrato-tecnico'
import type { RevisaoDePlanejamento, TarefaDeProduto } from './planejamento'
export interface EnvioTecnico { chave: string; estado: 'pendente' | 'confirmado'; sessao: string; execucao: string; status: string; mensagem?: string; enfileirada?: boolean }
export interface RevisaoTecnica { revisao: number; fonte: string; hash: string; aprovada: boolean; criadaEm: string; envio: EnvioTecnico | null }
export function modeloTecnico(p: RevisaoDePlanejamento, tarefa: TarefaDeProduto): string {
  const d: DocumentoTecnico = { versao: 1, id: `tecnico-${tarefa.id}`, repo: p.documento.repo, produtoId: tarefa.id,
    origem: { planejamento: p.documento.id, revisao: p.revisao }, titulo: tarefa.titulo, solucao: tarefa.resultado,
    contexto: p.documento.epico?.problema || '', escopo: p.documento.epico?.escopo || '', exclusoes: p.documento.epico?.exclusoes || '',
    referencias: [], dependencias: tarefa.dependeDe, riscos: '', risco: 'low',
    criterios: tarefa.criterios.map((descricao, i) => ({ id: `criterio-${i + 1}`, descricao, resultado: '', verificacao: '', verificador: 'test', obrigatorio: true })),
    microtasks: [{ id: 'implementacao', titulo: tarefa.titulo, instrucao: tarefa.resultado, saida: '', agente: 'limpio', dependeDe: [], arquivos: [], criterios: tarefa.criterios.map((_, i) => `criterio-${i + 1}`) }],
    operacao: { e2e: '', observabilidade: '', logging: '', flags: '', ativacao: '', sucesso: '', interrupcao: '', reversao: '' } }
  return serializarTecnico(d)
}
