import type { ConsumoDoProvedor } from '../../../ai/consumo'
import type { Situacao } from '../../../ai/disponibilidade'

export interface LinhaDeProvedor {
  nome: string
  situacao: Situacao
  motivo: string
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
