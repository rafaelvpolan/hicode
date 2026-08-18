import type { ConsumoDoProvedor } from '../../../ai/consumo'
import type { Situacao } from '../../../ai/disponibilidade'
import type { JanelaDeUso } from '../../../ai/planos'

export interface LinhaDeProvedor {
  nome: string
  situacao: Situacao
  habilitado: boolean
  motivo: string
  plano: string
  detalheDoPlano: string
  janelas: JanelaDeUso[]
  idadeDoUsoHoras: number
  modelosDisponiveis: string[]
  papeis: string[]
  modelo: string
  esforco: string
  restringeFerramenta: boolean
  isolaLeitura: boolean
  reportaCusto: boolean
}

export interface ItemDoLoop {
  id: string
  passo: string
  agente: string
  desde: string
}

export interface EstadoDaConfig {
  provedores: LinhaDeProvedor[]
  selecionado: string
  uso5h: ConsumoDoProvedor[]
  usoSemana: ConsumoDoProvedor[]
  serie: number[]
  loop: ItemDoLoop[]
  fila: number
  gastoHoje: number
  tetoUsd: number
  projeto: string
}

export interface OpcoesConfig {
  color: boolean
  largura: number
  altura: number
}
