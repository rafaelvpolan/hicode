import { truncVisible, padVisible } from '../tui/layout'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const GREEN = '\x1b[32m'

export interface Acao {
  tecla: string
  texto: string
}

export interface PendenciaDaTarefa {
  titulo: string
  acoes: Acao[]
  urgente: boolean
}

export function pendenciaDoStatus(status: string, id: string): PendenciaDaTarefa | null {
  const n = Number(id)
  switch (status) {
    case 'CLARIFY':
      return {
        titulo: 'a tarefa fez uma pergunta',
        urgente: true,
        acoes: [
          { tecla: '↑/↓', texto: 'escolhe a opcao abaixo' },
          { tecla: 'numero', texto: 'responde direto' },
        ],
      }
    case 'PREVIEW':
      return {
        titulo: 'resultado pronto — veja e decida',
        urgente: true,
        acoes: [
          { tecla: 'enter', texto: 'aprova e segue para o polimento' },
          { tecla: '1 2 3', texto: 'aprova · refaz do zero · diz o que ajustar' },
        ],
      }
    case 'INBOX':
    case 'READY':
    case 'SPECCED':
    case 'PLAN_APPROVED':
      return {
        titulo: 'plano ainda nao aprovado',
        urgente: true,
        acoes: [
          { tecla: 'enter', texto: 'aprova e poe na fila' },
          { tecla: String(n), texto: 'o numero da tarefa reabre o plano' },
        ],
      }
    case 'HALTED':
    case 'PAUSED':
      return {
        titulo: 'a tarefa parou',
        urgente: true,
        acoes: [
          { tecla: 'enter', texto: 'retoma de onde parou' },
          { tecla: 'escrever', texto: 'manda uma instrucao nova' },
        ],
      }
    case 'PR_OPEN':
      return {
        titulo: 'PR aberto — a revisao e sua',
        urgente: true,
        acoes: [{ tecla: 'GitHub', texto: 'revise e faca o merge por la' }],
      }
    default:
      return null
  }
}

export interface PendenciaOptions {
  color: boolean
  width: number
  detalhe: string
}

const PADRAO: PendenciaOptions = { color: false, width: 78, detalhe: '' }

function paint(s: string, cor: string, o: PendenciaOptions): string {
  return o.color ? `${cor}${s}${RESET}` : s
}

export function renderPendencia(status: string, id: string, opts: Partial<PendenciaOptions> = {}): string[] {
  const o = { ...PADRAO, ...opts }
  const p = pendenciaDoStatus(status, id)
  if (!p) {
    return ['', `  ${paint('▸', GREEN, o)} ${paint('rodando — nada a fazer agora', DIM, o)}`, '']
  }
  const largura = p.acoes.reduce((a, x) => Math.max(a, x.tecla.length), 0)
  const cabecalho = `  ${paint('⚑', YELLOW, o)} ${paint('precisa de voce', BOLD, o)}  ${paint(p.titulo, YELLOW, o)}`
  const linhas = p.acoes.map(a =>
    `      ${paint(padVisible(a.tecla, largura), CYAN, o)}  ${paint(a.texto, DIM, o)}`)
  const extra = o.detalhe ? [`      ${paint(o.detalhe, DIM, o)}`] : []
  return ['', cabecalho, ...linhas, ...extra, ''].map(l => truncVisible(l, o.width))
}
