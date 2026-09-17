export type PapelHii = 'implement' | 'step' | 'verify' | 'gate'
export interface PreferenciaHii { provider?: string; model?: string; effort?: string; modo?: string }
export interface CapacidadesHii {
  avaliacao?: { versoes: number[] }
  tecnico?: { versoes: number[]; limiteLinhas: number }
  versao: number
  observabilidade?: { versoes: number[] }
  configuracao?: { versoes: number[]; leitura: boolean; escrita: boolean }
}
export interface ProvedorHii {
  nome: string
  situacao: string
  comoObter: string
  modelo: string
  modelos: string[]
  aptidao?: { agentic: boolean; isolatesReadonly: boolean; emitsStructuredJson: boolean; restrictsTools: boolean }
}
export interface ConfiguracaoHii {
  versao: number
  preferencias: Partial<Record<PapelHii, PreferenciaHii>>
  aplicacao: string
}
export interface ConfiguracaoDoPainel {
  disponivel: boolean
  escrita: boolean
  motivo: string
  etag: string
  configuracao: ConfiguracaoHii | null
  provedores: ProvedorHii[]
}
export function motivoDeInelegibilidade(p: ProvedorHii, papel: PapelHii): string {
  if (!p.aptidao) return 'Motor nao informa capacidades deste provedor'
  if (papel === 'implement' && !p.aptidao.agentic) return 'Provedor nao executa edicao de arquivos'
  if ((papel === 'gate' || papel === 'verify') && (!p.aptidao.isolatesReadonly || !p.aptidao.emitsStructuredJson)) return 'Verificacao exige isolamento de leitura e JSON estruturado'
  return ''
}
