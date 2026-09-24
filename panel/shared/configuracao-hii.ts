export type PapelHii = 'implement' | 'step' | 'verify' | 'gate'
export interface PreferenciaHii { provider?: string; model?: string; effort?: string; modo?: string; autoReview?: boolean; revisao?: object }
export interface CapacidadesHii {
  avaliacao?: { versoes: number[] }
  tecnico?: { versoes: number[]; limiteLinhas: number; dependenciasProduto?: number }
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
  localidade?: 'verificada' | 'indeterminada' | 'remota'
  aptidao?: { agentic: boolean; isolatesReadonly: boolean; emitsStructuredJson: boolean; restrictsTools: boolean }
  inferencia?: { servidor: string; modelo: string; limiteServidor: number; limiteModelo: number; emUsoNoServidor: number; emUsoNoModelo: number; disponivel: boolean; configuracaoValida: boolean } | null
  identidadeInferencia?: { endpoint: string; versao: string | null; verificadoEm: number | null; origem: 'servidor' | 'configuracao'; modelos: { nome: string; digest: string | null }[] } | null
}
export function rotuloDeIdentidade(p: ProvedorHii): string {
  const i = p.identidadeInferencia
  if (!i) return 'identidade de inferencia nao informada'
  const modelo = i.modelos.find(m => m.nome === p.modelo) ?? i.modelos[0]
  const idade = i.verificadoEm ? Math.max(0, Math.floor((Date.now() - i.verificadoEm) / 1000)) + 's' : 'desconhecida'
  return `${i.endpoint} · servidor ${i.versao || 'versao desconhecida'} · ${modelo?.nome || 'modelo desconhecido'}${modelo?.digest ? ` (${modelo.digest.slice(0, 19)})` : ''} · aferido ha ${idade}`
}
export function rotuloDeLocalidade(p: ProvedorHii): string {
  if (p.localidade === 'verificada') return 'inferencia local verificada'
  if (p.localidade === 'remota') return 'inferencia remota'
  return 'localidade da inferencia indeterminada'
}
export function rotuloDeCapacidade(p: ProvedorHii): string {
  const c = p.inferencia
  if (!c) return 'capacidade de inferencia nao informada'
  if (!c.configuracaoValida) return 'capacidade de inferencia com configuracao invalida'
  return `${c.emUsoNoServidor}/${c.limiteServidor} chamada(s) no servidor · ${c.emUsoNoModelo}/${c.limiteModelo} no modelo ${c.modelo} · ${c.disponivel ? 'slot disponivel' : 'fila ocupada'}`
}
export interface ConfiguracaoHii {
  versao: number
  preferencias: Partial<Record<PapelHii, PreferenciaHii>>
  aplicacao: string
  execucao?: { localidade: 'preferir_local' | 'somente_local' | 'qualquer'; fallbackRemoto: boolean; editavel: boolean }
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
