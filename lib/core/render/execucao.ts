import type { Atividade } from '../activity'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const VERDE = '\x1b[32m'
const VERMELHO = '\x1b[31m'
const CIANO = '\x1b[36m'

export interface OpcoesExecucao {
  color: boolean
}

const PADRAO: OpcoesExecucao = { color: false }

const BULLET = '●'
const RAMO = '⎿'
const MARCO = '◇'
const LIMITE_RESULTADO = 160

function paint(s: string, cor: string, o: OpcoesExecucao): string {
  return o.color && s ? `${cor}${s}${RESET}` : s
}

function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function encurtar(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function chamadaDe(a: Atividade): string {
  if (a.tipo === 'agente') return `Task(${[a.nome, a.alvo].filter(Boolean).join(' — ')})`
  if (a.tipo === 'skill') return `Skill(${[a.nome, a.alvo].filter(Boolean).join(' — ')})`
  if (a.tipo === 'mcp') return `${a.alvo || a.nome}(${a.args ?? ''})`
  if (a.tipo === 'texto') return `${a.nome}(${a.alvo})`
  return `${capitalizar(a.nome)}(${a.alvo})`
}

function falhou(resultado: string): boolean {
  return /\b(erro|error|failed|falhou|denied|permission|nao consegui|exit=[1-9])/i.test(resultado)
}

function linhaDoResultado(a: Atividade, o: OpcoesExecucao): string[] {
  if (!a.resultado) return []
  const texto = encurtar(a.resultado, LIMITE_RESULTADO)
  const cor = falhou(texto) ? VERMELHO : DIM
  return [`  ${paint(RAMO, DIM, o)} ${paint(texto, cor, o)}`]
}

function prosa(a: Atividade, o: OpcoesExecucao): string[] {
  const linhas = a.alvo.split('\n')
  const primeira = `${paint(BULLET, CIANO, o)} ${linhas[0] ?? ''}`
  return [primeira, ...linhas.slice(1).map(l => `  ${l}`)]
}

function marco(a: Atividade, o: OpcoesExecucao): string[] {
  if (a.nome === 'timeout') return [`${paint(MARCO, VERMELHO, o)} ${paint('TIMEOUT — a IA foi encerrada', VERMELHO, o)}`]
  if (a.tipo === 'sessao') {
    const hora = a.ts.includes('T') ? (a.ts.split('T')[1] ?? '').replace('Z', '') : ''
    const rotulo = [a.alvo || 'sessao iniciada', hora].filter(Boolean).join(' · ')
    return [`${paint(MARCO, DIM, o)} ${paint(rotulo, DIM, o)}`]
  }
  return [`${paint(MARCO, VERDE, o)} ${paint(`concluido ${a.alvo}`, DIM, o)}`]
}

export function linhasDaAtividade(a: Atividade, opts: Partial<OpcoesExecucao> = {}): string[] {
  const o = { ...PADRAO, ...opts }
  if (a.tipo === 'sessao' || a.tipo === 'fim') return marco(a, o)
  if (a.tipo === 'texto' && !a.nome) return prosa(a, o)
  const chamada = chamadaDe(a)
  const abre = chamada.indexOf('(')
  const nome = abre > 0 ? chamada.slice(0, abre) : chamada
  const args = abre > 0 ? chamada.slice(abre) : ''
  return [
    `${paint(BULLET, CIANO, o)} ${paint(nome, BOLD, o)}${paint(args, DIM, o)}`,
    ...linhaDoResultado(a, o),
  ]
}

export function renderExecucao(atividades: Atividade[], opts: Partial<OpcoesExecucao> = {}): string[] {
  return atividades.flatMap(a => linhasDaAtividade(a, opts))
}
