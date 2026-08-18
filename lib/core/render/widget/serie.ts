import { severidadeDe, type Severidade } from './barra'

const RESET = '\x1b[0m'
const VERDE = '\x1b[32m'
const AMARELO = '\x1b[33m'
const VERMELHO = '\x1b[31m'

const BLOCOS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const
const SUBNIVEIS = BLOCOS.length
const CHEIO = '█'
const VAZIO = ' '
const SEM_COR = ''

const COR_DA_SEVERIDADE: Record<Severidade, string> = {
  ok: VERDE,
  atencao: AMARELO,
  critico: VERMELHO,
}

export interface OpcoesSerie {
  color: boolean
  largura: number
  altura: number
}

function paint(s: string, cor: string, o: OpcoesSerie): string {
  return o.color && cor ? `${cor}${s}${RESET}` : s
}

function corDaRazao(razao: number): string {
  return COR_DA_SEVERIDADE[severidadeDe(razao)]
}

function dimensao(pedido: number): number {
  return Number.isFinite(pedido) ? Math.max(0, Math.trunc(pedido)) : 0
}

function pisoZero(valores: number[]): number[] {
  return valores.map(v => (Number.isFinite(v) && v > 0 ? v : 0))
}

function mediaPorBalde(valores: number[], largura: number): number[] {
  const total = valores.length
  const baldes: number[] = []
  for (let i = 0; i < largura; i++) {
    const inicio = Math.floor((i * total) / largura)
    const fim = Math.max(inicio + 1, Math.floor(((i + 1) * total) / largura))
    let soma = 0
    for (let k = inicio; k < fim; k++) soma += valores[k] ?? 0
    baldes.push(soma / (fim - inicio))
  }
  return baldes
}

function colunas(valores: number[], largura: number): number[] {
  const largo = dimensao(largura)
  if (largo === 0) return []
  const limpos = pisoZero(valores)
  if (limpos.length === 0) return new Array<number>(largo).fill(0)
  if (limpos.length > largo) return mediaPorBalde(limpos, largo)
  return [...new Array<number>(largo - limpos.length).fill(0), ...limpos]
}

function razoesDoMaximo(cols: number[]): number[] {
  const maximo = cols.reduce((m, v) => (v > m ? v : m), 0)
  return maximo > 0 ? cols.map(v => v / maximo) : cols.map(() => 0)
}

function blocoParcial(subniveis: number): string {
  return BLOCOS[subniveis - 1] ?? VAZIO
}

function celula(razao: number, linhasAbaixo: number, altura: number): string {
  const preenchido = razao > 0 ? Math.ceil(razao * altura * SUBNIVEIS) : 0
  const nesta = preenchido - linhasAbaixo * SUBNIVEIS
  if (nesta >= SUBNIVEIS) return CHEIO
  if (nesta <= 0) return VAZIO
  return blocoParcial(nesta)
}

function juntarPorCor(celulas: string[], cores: string[], o: OpcoesSerie): string {
  if (!o.color) return celulas.join('')
  let saida = ''
  let i = 0
  while (i < celulas.length) {
    const cor = cores[i] ?? SEM_COR
    let trecho = ''
    while (i < celulas.length && (cores[i] ?? SEM_COR) === cor) {
      trecho += celulas[i] ?? VAZIO
      i++
    }
    saida += paint(trecho, cor, o)
  }
  return saida
}

export function serie(valores: number[], o: OpcoesSerie): string[] {
  const alto = dimensao(o.altura)
  const razoes = razoesDoMaximo(colunas(valores, o.largura))
  const linhas: string[] = []
  for (let linha = 0; linha < alto; linha++) {
    const linhasAbaixo = alto - 1 - linha
    const celulas = razoes.map(razao => celula(razao, linhasAbaixo, alto))
    const cores = celulas.map((c, i) => (c === VAZIO ? SEM_COR : corDaRazao(razoes[i] ?? 0)))
    linhas.push(juntarPorCor(celulas, cores, o))
  }
  return linhas
}

export function esparklinha(valores: number[], largura: number): string {
  return razoesDoMaximo(colunas(valores, largura))
    .map(razao => (razao > 0 ? blocoParcial(Math.min(SUBNIVEIS, Math.ceil(razao * SUBNIVEIS))) : VAZIO))
    .join('')
}
