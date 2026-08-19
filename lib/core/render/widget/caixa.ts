import { CANTO } from '../../tui/paleta'
import { visibleLen, truncVisible, padVisible, stripAnsi } from '../../tui/layout'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const LARGURA_MINIMA = 4
const MOLDURA = 2
const RESERVA_DO_TITULO = 3
const QUEBRAS = /[\t\n\v\f\r]+/g
const CONTROLE = /[\x00-\x1f\x7f]/g
const CONTROLE_FORA_DO_ESCAPE = /[\x00-\x08\x0e-\x1a\x1c-\x1f\x7f]/g

export interface OpcoesCaixa {
  color: boolean
  largura: number
}

export interface OpcoesGrade {
  largura: number
  colunas: number
}

interface Coluna {
  bloco: string[]
  largura: number
}

function paint(s: string, cor: string, o: { color: boolean }): string {
  return o.color && s ? `${cor}${s}${RESET}` : s
}

function mensuravel(s: string, o: { color: boolean }): string {
  const emUmaLinha = s.replace(QUEBRAS, ' ')
  return o.color
    ? emUmaLinha.replace(CONTROLE_FORA_DO_ESCAPE, '')
    : stripAnsi(emUmaLinha).replace(CONTROLE, '')
}

function inteiro(valor: number, minimo: number): number {
  return Number.isFinite(valor) ? Math.max(minimo, Math.floor(valor)) : minimo
}

export function larguraDoBloco(bloco: string[]): number {
  return bloco.reduce((maior, linha) => Math.max(maior, visibleLen(linha)), 0)
}

function juntar(colunas: Coluna[]): string[] {
  const altura = colunas.reduce((maior, c) => Math.max(maior, c.bloco.length), 0)
  const saida: string[] = []
  for (let i = 0; i < altura; i++) {
    let linha = ''
    for (const c of colunas) linha += c.largura > 0 ? padVisible(c.bloco[i] ?? '', c.largura) : ''
    saida.push(linha)
  }
  return saida
}

function larguraDaColuna(largura: number, colunas: number, indice: number): number {
  const base = Math.floor(largura / colunas)
  return base + (indice < largura - base * colunas ? 1 : 0)
}

export function caixa(titulo: string, corpo: string[], o: OpcoesCaixa): string[] {
  const largura = inteiro(o.largura, LARGURA_MINIMA)
  const interno = largura - MOLDURA
  const espacoDoTitulo = interno - RESERVA_DO_TITULO
  const texto = mensuravel(titulo, o).trim()
  const rotulo = texto && espacoDoTitulo > 0 ? ` ${truncVisible(texto, espacoDoTitulo)} ` : ''
  const sobra = Math.max(0, interno - 1 - visibleLen(rotulo))
  const saida = [paint(`${CANTO.supEsq}─`, DIM, o) + paint(rotulo, CYAN, o) + paint('─'.repeat(sobra) + CANTO.supDir, DIM, o)]
  for (const linha of corpo) {
    const conteudo = padVisible(truncVisible(mensuravel(linha, o), interno), interno)
    saida.push(paint('│', DIM, o) + conteudo + (o.color ? RESET : '') + paint('│', DIM, o))
  }
  saida.push(paint(CANTO.infEsq + '─'.repeat(interno) + CANTO.infDir, DIM, o))
  return saida
}

export function lado(esquerda: string[], direita: string[]): string[] {
  return juntar([
    { bloco: esquerda, largura: larguraDoBloco(esquerda) },
    { bloco: direita, largura: larguraDoBloco(direita) },
  ])
}

export function grade(blocos: string[][], o: OpcoesGrade): string[] {
  const largura = inteiro(o.largura, 1)
  const colunas = Math.min(inteiro(o.colunas, 1), largura)
  const saida: string[] = []
  for (let inicio = 0; inicio < blocos.length; inicio += colunas) {
    const fila = blocos.slice(inicio, inicio + colunas).map((bloco, indice) => ({
      bloco,
      largura: larguraDaColuna(largura, colunas, indice),
    }))
    for (const linha of juntar(fila)) saida.push(padVisible(linha, largura))
  }
  return saida
}
