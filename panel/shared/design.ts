export type Tom = 'neutro' | 'acento' | 'ok' | 'atencao' | 'falha' | 'parado' | 'rodando'

export type EstadoDeEtapa = 'feito' | 'agora' | 'pendente' | 'falhou' | 'ativo' | 'desativado'

export type VarianteDeBotao = 'solido' | 'fantasma' | 'perigo' | 'texto'

export type TamanhoDeBotao = 'sm' | 'md'

export type TamanhoDeKpi = 'md' | 'lg'

export type EspacoDoLayout = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'

export type DirecaoDaPilha = 'coluna' | 'linha'

export interface EtapaView {
  numero: number
  rotulo: string
  estado: EstadoDeEtapa
  detalhe: string
  acaoRotulo: string
  acaoValor: string
}

export const TOM_POR_ESTADO_DE_ETAPA: Record<EstadoDeEtapa, Tom> = {
  feito: 'ok',
  agora: 'rodando',
  pendente: 'parado',
  falhou: 'falha',
  ativo: 'acento',
  desativado: 'neutro',
}

export interface SeloDeCard {
  chave: string
  rotulo: string
  tom: Tom
  titulo: string
  ponto: boolean
  pulsando: boolean
}
