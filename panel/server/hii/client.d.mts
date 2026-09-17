import type { AvaliacaoDeExecucao } from '../../shared/avaliacao-hii'
import type { CapacidadesHii, ConfiguracaoHii, ProvedorHii, PapelHii } from '../../shared/configuracao-hii'
import type { Atividade, Escopo, Snapshot } from '../../shared/observabilidade'
interface Recurso<T> { valor: T; etag: string }
interface Projecao { atividades: Map<string, Atividade>; cursor: string; degradado: boolean }
export declare function clienteHii(base: string, token: string): {
  capacidades(): Promise<Recurso<CapacidadesHii>>
  configuracao(): Promise<Recurso<ConfiguracaoHii>>
  provedores(): Promise<Recurso<{ provedores: ProvedorHii[] }>>
  configurar(ajuste: { versao: 1; papel: PapelHii; provider: string; model: string }, chave: string, etag: string): Promise<Recurso<ConfiguracaoHii>>
  observarSnapshot(filtro?: Partial<Escopo>, depois?: string): Promise<Recurso<Snapshot>>
  observar(filtro: Partial<Escopo>, receber: (p: Projecao) => void, falhar?: (e: Error) => void): { dispose(): void; concluido: Promise<void> }
  novaSessao(repo: string, titulo: string, chave: string): Promise<Recurso<{ id: string }>>
  sessao(id: string): Promise<Recurso<{ id: string; repo: string }>>
  pedido(id: string, pedido: { modo: 'gateway' | 'orquestrador'; texto: string } | { modo: 'orquestrador'; tecnico: string; dependencias?: { produto: string; execucao: string; tecnicoHash: string }[] }, chave: string): Promise<Recurso<{ id: string; sessao: string; status: string; mensagem: string; enfileirada: boolean }>>
  perguntar(repo: string, pergunta: string, chave: string, sessao?: string): Promise<Recurso<{ id: string; atividade: string; estado: string }>>
  consulta(id: string): Promise<Recurso<{ id: string; repo: string; estado: string; resposta: string; custoUsd: number | null }>>
  avaliacao(id: string): Promise<Recurso<AvaliacaoDeExecucao>>
  tarefa(id: string): Promise<Recurso<{ campos: Record<string, string>; objetivo: string }>>
  perguntas(id: string): Promise<Recurso<{ perguntaId: string | null; pendencia: { atual: { q: string; options: string[]; recommended?: string } } | null }>>
  responderPergunta(id: string, perguntaId: string, texto: string, chave: string, etag: string): Promise<Recurso<object>>
  agir(id: string, acao: 'responder' | 'parar' | 'retomar' | 'confirmar-fecho' | 'recusar-fecho' | 'aprovar-plano' | 'aprovar-url' | 'recusar', texto: string, chave: string, etag: string): Promise<Recurso<object>>
}
