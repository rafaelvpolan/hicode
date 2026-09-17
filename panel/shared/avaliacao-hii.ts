// Gerado de hii/motor/api/avaliacao-contrato.ts; use scripts/sincronizar-tecnico.mjs.
export interface AvaliacaoDeExecucao {
  versao: 1
  execucao: string
  repo: string
  sessao: string
  status: string
  modo: string
  plano: { revisao: number; hash: string; produto: string; planejamento: string; origemRevisao: number; tecnicoHash: string } | null
  atualidade: 'ausente' | 'atual' | 'desatualizada' | 'indisponivel' | 'inconsistente'
  motivo: string
  consultadaEm: string
  evidenciaEm: string | null
  tentativa: string | null
  criteriosAprovados: boolean
  criterios: {
    id: string; descricao: string; obrigatorio: boolean
    estado: 'aprovado' | 'reprovado' | 'inconclusivo' | 'nao-aplicavel'
    resultadoRegistrado: 'aprovado' | 'reprovado' | 'inconclusivo' | 'nao-aplicavel' | null
    comando: string[]; exitCode: number | null; timeout: boolean; duracaoMs: number | null; saida: string
  }[]
}
