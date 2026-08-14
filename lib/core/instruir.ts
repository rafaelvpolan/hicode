import { readCard, updateCard } from '../runner/card-store'
import { isoNow } from '../card/util'

const TERMINAIS = ['MERGED', 'DEPLOYED']
const ANTES_DE_EXECUTAR = ['INBOX', 'READY', 'CLARIFY', 'SPECCED', 'PLAN_APPROVED']
const TITULO = '## Instrucoes'

export interface ResultadoInstrucao {
  ok: boolean
  reason: string
  numero: number
  reexecuta: boolean
}

export function subPrompts(body: string): string[] {
  const i = body.indexOf(TITULO)
  if (i < 0) return []
  const resto = body.slice(i + TITULO.length)
  const fim = resto.search(/\n## /)
  const bloco = fim < 0 ? resto : resto.slice(0, fim)
  return bloco.split('\n')
    .map(l => l.replace(/^\s*\d+\.\s*/, '').trim())
    .filter(Boolean)
}

export function anexarSubPrompt(body: string, texto: string): string {
  const anteriores = subPrompts(body)
  const linha = `${anteriores.length + 1}. ${texto}`
  const i = body.indexOf(TITULO)
  if (i < 0) {
    const log = body.indexOf('## Log de Estado')
    const bloco = `${TITULO}\n${linha}\n`
    if (log < 0) return `${body.replace(/\s*$/, '')}\n\n${bloco}`
    return `${body.slice(0, log).replace(/\s*$/, '')}\n\n${bloco}\n${body.slice(log)}`
  }
  const resto = body.slice(i + TITULO.length)
  const fim = resto.search(/\n## /)
  const bloco = fim < 0 ? resto : resto.slice(0, fim)
  const depois = fim < 0 ? '' : resto.slice(fim)
  return body.slice(0, i) + TITULO + `${bloco.replace(/\s*$/, '')}\n${linha}\n` + depois
}

export function instruir(id: string, texto: string): ResultadoInstrucao {
  const limpo = texto.trim()
  const vazio = { ok: false, numero: 0, reexecuta: false }
  if (!limpo) return { ...vazio, reason: 'instrucao vazia' }
  const card = readCard(id)
  if (!card) return { ...vazio, reason: `card #${id} nao encontrado` }
  const status = card.fm.status ?? 'INBOX'
  if (TERMINAIS.includes(status)) {
    return { ...vazio, reason: `#${id} ja foi entregue (${status}) — crie uma tarefa nova para mudar isso` }
  }
  const antes = ANTES_DE_EXECUTAR.includes(status)
  const numero = subPrompts(card.body).length + 1
  const r = updateCard(id, {
    fields: antes ? {} : { correction: limpo, status: 'CORRECTING' },
    body: body => anexarSubPrompt(body, limpo),
    log: `${isoNow()} instrucao ${numero}: ${limpo.slice(0, 120)}`,
  })
  if (!r) return { ...vazio, reason: `nao consegui escrever em #${id}` }
  return { ok: true, reason: '', numero, reexecuta: !antes }
}
