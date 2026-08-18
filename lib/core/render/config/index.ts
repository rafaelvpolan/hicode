import { caixa, grade } from '../widget/caixa'
import { serie } from '../widget/serie'
import { painelDeIas, painelDeTokens, painelDeUso, painelDoLoop, painelDoProvedor } from './paineis'
import type { EstadoDaConfig, OpcoesConfig } from './tipos'

export type { EstadoDaConfig, LinhaDeProvedor, ItemDoLoop, OpcoesConfig } from './tipos'

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const CYAN = '\x1b[36m'
const ALTURA_DA_SERIE = 3

function paint(s: string, cor: string, o: OpcoesConfig): string {
  return o.color && s ? `${cor}${s}${RESET}` : s
}

function colunas(largura: number): number {
  return largura >= 96 ? 2 : 1
}

function larguraDaColuna(largura: number, cols: number): number {
  return Math.max(24, Math.floor(largura / cols))
}

export function renderConfig(e: EstadoDaConfig, o: OpcoesConfig): string[] {
  const cols = colunas(o.largura)
  const w = larguraDaColuna(o.largura, cols)
  const escolhido = e.provedores.find(p => p.nome === e.selecionado)
  const opcoes: OpcoesConfig = { ...o, largura: w }
  const cx = { color: o.color, largura: w }

  const blocos = [
    caixa('IAS CONECTADAS', painelDeIas(e, w - 2, opcoes), cx),
    caixa(`${(e.selecionado || 'ia').toUpperCase()} · CONFIGURADO`, painelDoProvedor(escolhido, w - 2, opcoes), cx),
    caixa('USO 5H', painelDeUso(e.uso5h, w - 2, opcoes), cx),
    caixa('USO SEMANA', painelDeUso(e.usoSemana, w - 2, opcoes), cx),
    caixa('TOKENS 5H', painelDeTokens(e.uso5h, w - 2, opcoes), cx),
    caixa('LOOP EM EXECUCAO', painelDoLoop(e.loop, e.fila, w - 2, opcoes), cx),
  ]

  const cabecalho = [
    `  ${paint('/config', CYAN, o)}  ${paint(`projeto ${e.projeto || '(nenhum)'} · gasto hoje US$ ${e.gastoHoje.toFixed(2)}`, DIM, o)}`,
    '',
  ]
  const custo = caixa('CUSTO NA JANELA DE 5H', serie(e.serie, {
    color: o.color, largura: o.largura - 4, altura: ALTURA_DA_SERIE,
  }), { color: o.color, largura: o.largura })

  return [...cabecalho, ...grade(blocos, { largura: o.largura, colunas: cols }), ...custo]
}
