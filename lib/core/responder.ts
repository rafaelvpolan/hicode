import { readClarify, writeClarify } from '../runner/clarify'
import { readCard } from '../runner/card-store'
import { answerClarify } from './actions'
import type { ClarifyQuestion, Fields } from '../card/types'

export interface Pendencia {
  id: string
  titulo: string
  perguntas: ClarifyQuestion[]
  indice: number
  atual: ClarifyQuestion
}

export interface RespostaResult {
  ok: boolean
  reason: string
  resposta: string
  restantes: number
  retomou: boolean
}

function naoRespondida(perguntas: ClarifyQuestion[]): number {
  return perguntas.findIndex(q => !q.answer)
}

export function pendencia(id: string): Pendencia | null {
  const card = readCard(id)
  if (!card || card.fm.status !== 'CLARIFY') return null
  const perguntas = readClarify(id)
  const indice = naoRespondida(perguntas)
  const atual = perguntas[indice]
  if (!atual) return null
  return { id, titulo: card.fm.title ?? '', perguntas, indice, atual }
}

export function cardsPerguntando(cards: Fields[], repo = ''): string[] {
  return cards
    .filter(c => c.status === 'CLARIFY' && (!repo || c.repo === repo))
    .map(c => c.id ?? '')
    .filter(Boolean)
}

export function resolverResposta(pergunta: ClarifyQuestion, entrada: string): string {
  const texto = entrada.trim()
  if (!texto || texto === 'r') return pergunta.recommended || pergunta.options[0] || ''
  if (/^\d{1,2}$/.test(texto)) {
    const escolha = pergunta.options[Number(texto) - 1]
    return escolha ?? ''
  }
  return texto
}

export function responder(id: string, entrada: string): RespostaResult {
  const vazio = { ok: false, resposta: '', restantes: 0, retomou: false }
  const p = pendencia(id)
  if (!p) {
    const card = readCard(id)
    if (!card) return { ...vazio, reason: `card #${id} nao encontrado` }
    return { ...vazio, reason: `#${id} esta em ${card.fm.status ?? 'INBOX'} — nao ha pergunta aberta` }
  }
  const resposta = resolverResposta(p.atual, entrada)
  if (!resposta) {
    return { ...vazio, reason: `opcao invalida — escolha de 1 a ${p.atual.options.length}, ou escreva a resposta` }
  }
  const perguntas = p.perguntas.map((q, i) => (i === p.indice ? { ...q, answer: resposta } : q))
  writeClarify(id, perguntas)
  const restantes = perguntas.filter(q => !q.answer).length
  if (restantes > 0) return { ok: true, reason: '', resposta, restantes, retomou: false }
  const pares = perguntas.map(q => ({ q: q.q, answer: q.answer ?? '' }))
  const r = answerClarify(id, pares)
  return { ok: !!r, reason: r ? '' : `nao foi possivel retomar #${id}`, resposta, restantes: 0, retomou: !!r }
}
