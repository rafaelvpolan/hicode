export type ValorRecuperacao = null | boolean | number | string | ValorRecuperacao[] | { [chave: string]: ValorRecuperacao }
export interface PreviaRecuperacao {
  versao: 1; origem: string; hash: string; tarefa: string | null
  estado: 'importar' | 'vinculada' | 'bloqueada'; motivo: string; origemStatus: string; preservados: string[]
}
export interface DiagnosticoRecuperacao {
  versao: 1; tarefa: string; revisao: string; origem: string; status: string
  preparada: boolean; podePreparar: boolean; bloqueios: string[]; avisos: string[]; worktree: string; branch: string; fingerprint: string
  configuracao: string | null
  snapshots: { hash: string; instante: string; motivo: string; configuracao: Record<string, ValorRecuperacao> }[]
  motor: { estado: string; motivo: string; versao: string }
}
export interface RecuperacaoDoPainel {
  arquivo: string; previa: PreviaRecuperacao; diagnostico: DiagnosticoRecuperacao | null
  vinculo: { estado: 'pendente' | 'confirmado'; tarefa: string } | null
}
