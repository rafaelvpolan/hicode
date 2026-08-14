import { truncVisible } from '../tui/layout'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'

export interface OpcaoAprovacao {
  chave: string
  texto: string
  cor: 'sim' | 'nao' | 'neutro'
}

export const OPCOES_APROVACAO: OpcaoAprovacao[] = [
  { chave: '1', texto: 'aprovar — segue para o polimento', cor: 'sim' },
  { chave: '2', texto: 'recusar e refazer do zero', cor: 'nao' },
  { chave: '3', texto: 'recusar dizendo o que ajustar', cor: 'nao' },
]

export interface AprovacaoOptions {
  color: boolean
  width: number
  selecionado: string
  url: string
  comentando: boolean
}

const PADRAO: AprovacaoOptions = { color: false, width: 78, selecionado: '', url: '', comentando: false }

function paint(s: string, cor: string, o: AprovacaoOptions): string {
  return o.color ? `${cor}${s}${RESET}` : s
}

function corDa(op: OpcaoAprovacao): string {
  return op.cor === 'sim' ? GREEN : op.cor === 'nao' ? RED : CYAN
}

export function renderAprovacao(id: string, opts: Partial<AprovacaoOptions> = {}): string[] {
  const o = { ...PADRAO, ...opts }
  if (o.comentando) {
    return [
      `  ${paint('✎', CYAN, o)} ${paint(`#${id} — escreva o que ajustar`, BOLD, o)}${paint('  ·  enter vazio desiste', DIM, o)}`,
    ].map(l => truncVisible(l, o.width))
  }
  const alvo = o.url ? paint(`  ${o.url}`, DIM, o) : ''
  const cabecalho = `  ${paint('◎', CYAN, o)} ${paint(`#${id} aprovar o preview?`, BOLD, o)}${alvo}`
  const linhas = OPCOES_APROVACAO.map((op) => {
    const marcada = o.selecionado === `op:${op.chave}`
    const marca = marcada ? paint('›', CYAN, o) : ' '
    const numero = paint(op.chave, corDa(op), o)
    const texto = marcada && o.color ? `${BOLD}${op.texto}${RESET}` : paint(op.texto, DIM, o)
    return `${marca} ${numero}  ${texto}`
  })
  return [cabecalho, ...linhas].map(l => truncVisible(l, o.width))
}
