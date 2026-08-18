import { padVisible, truncVisible } from '../../tui/layout'
import { barraRotulada } from '../widget/barra'
import type { ConsumoDoProvedor } from '../../../ai/consumo'
import type { EstadoDaConfig, ItemDoLoop, LinhaDeProvedor, OpcoesConfig } from './tipos'

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const CYAN = '\x1b[36m'
const VERDE = '\x1b[32m'
const VERMELHO = '\x1b[31m'
const CURSOR = '▸'

function paint(s: string, cor: string, o: { color: boolean }): string {
  return o.color && s ? `${cor}${s}${RESET}` : s
}

function campo(rotulo: string, valor: string, largura: number, o: OpcoesConfig): string {
  const espaco = Math.max(4, Math.floor(largura * 0.42))
  return ` ${paint(padVisible(rotulo, espaco), DIM, o)}${truncVisible(valor, Math.max(1, largura - espaco - 2))}`
}

const AMARELO = '\x1b[33m'

function rotuloDaSituacao(p: LinhaDeProvedor, o: OpcoesConfig): string {
  if (p.situacao === 'disponivel') return paint('conectada', VERDE, o)
  if (p.situacao === 'precisa-servidor') return paint('servidor local', AMARELO, o)
  return paint('ausente', VERMELHO, o)
}

function sim(v: boolean, o: OpcoesConfig): string {
  return v ? paint('sim', VERDE, o) : paint('nao', VERMELHO, o)
}

export function painelDeIas(e: EstadoDaConfig, largura: number, o: OpcoesConfig): string[] {
  if (!e.provedores.length) return [' nenhuma ia configurada']
  return e.provedores.map((p) => {
    const marca = p.nome === e.selecionado ? paint(CURSOR, CYAN, o) : ' '
    const estado = padVisible(rotuloDaSituacao(p, o), 14)
    const nome = p.nome === e.selecionado ? paint(padVisible(p.nome, 9), CYAN, o) : padVisible(p.nome, 9)
    const papeis = p.papeis.length ? p.papeis.join(',') : '—'
    return truncVisible(` ${marca} ${nome} ${estado}  ${paint(papeis, DIM, o)}`, largura)
  })
}

export function painelDoProvedor(p: LinhaDeProvedor | undefined, largura: number, o: OpcoesConfig): string[] {
  if (!p) return [' escolha uma ia com ↑↓']
  const linhas = [
    campo('modelo', p.modelo || '(padrao do cli)', largura, o),
    campo('esforco', p.esforco || '(nao aceita)', largura, o),
    campo('papeis', p.papeis.length ? p.papeis.join(', ') : 'nenhum', largura, o),
    campo('restringe tool', sim(p.restringeFerramenta, o), largura, o),
    campo('isola leitura', sim(p.isolaLeitura, o), largura, o),
    campo('reporta custo', sim(p.reportaCusto, o), largura, o),
  ]
  if (p.situacao !== 'disponivel' && p.motivo) linhas.push(campo('como obter', p.motivo, largura, o))
  return linhas
}

function totalDe(uso: ConsumoDoProvedor[]): number {
  return uso.reduce((t, u) => t + u.custoUsd, 0)
}

export function painelDeUso(uso: ConsumoDoProvedor[], largura: number, o: OpcoesConfig): string[] {
  if (!uso.length) return [' sem execucao nesta janela']
  const total = totalDe(uso)
  const medidor = Math.max(8, largura - 22)
  const linhas = uso.slice(0, 5).map(u =>
    truncVisible(' ' + barraRotulada(u.provedor, u.custoUsd, total || 1, {
      color: o.color, largura: medidor, mostrarPercentual: true, rotuloEm: 9,
    }), largura))
  const tokens = uso.reduce((t, u) => t + u.tokens, 0)
  linhas.push(campo('gasto', `US$ ${total.toFixed(4)}`, largura, o))
  linhas.push(campo('tokens', tokens.toLocaleString('pt-BR'), largura, o))
  return linhas
}

export function painelDeTokens(uso: ConsumoDoProvedor[], largura: number, o: OpcoesConfig): string[] {
  if (!uso.length) return [' sem tokens na janela']
  return uso.slice(0, 4).flatMap(u => [
    ` ${paint(u.provedor, CYAN, o)} ${paint(u.modelos.join(',') || '(sem modelo)', DIM, o)}`,
    campo('  entrada', u.tokensEntrada.toLocaleString('pt-BR'), largura, o),
    campo('  saida', u.tokensSaida.toLocaleString('pt-BR'), largura, o),
    campo('  cache', u.tokensCache.toLocaleString('pt-BR'), largura, o),
  ])
}

export function painelDoLoop(loop: ItemDoLoop[], fila: number, largura: number, o: OpcoesConfig): string[] {
  if (!loop.length) return [fila ? ` ${fila} na fila, nada em execucao` : ' nada em execucao']
  const linhas = loop.slice(0, 5).map(i => truncVisible(
    ` ${paint(`#${i.id}`, CYAN, o)} ${padVisible(i.passo, 12)} ${paint(padVisible(i.agente, 9), DIM, o)} ${i.desde}`,
    largura))
  if (fila) linhas.push(paint(` +${fila} na fila`, DIM, o))
  return linhas
}
