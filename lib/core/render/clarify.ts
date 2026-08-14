import type { Pendencia } from '../responder'

export interface OpcoesClarify {
  color?: boolean
}

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const ACC = '\x1b[36m'
const BOLD = '\x1b[1m'

function paint(s: string, cor: string, o: OpcoesClarify): string {
  return o.color ? `${cor}${s}${RESET}` : s
}

export function renderPergunta(p: Pendencia, o: OpcoesClarify = {}): string[] {
  const total = p.perguntas.length
  const passo = total > 1 ? ` (${p.indice + 1}/${total})` : ''
  const out: string[] = ['', `  ${paint(`#${p.id} precisa de uma decisao${passo}`, BOLD, o)}`, '']
  for (const linha of quebrar(p.atual.q, 66)) out.push(`  ${linha}`)
  out.push('')
  p.atual.options.forEach((opcao, i) => {
    const sugerido = opcao === p.atual.recommended ? paint('  ← sugerido', DIM, o) : ''
    out.push(`    ${paint(String(i + 1), ACC, o)}  ${opcao}${sugerido}`)
  })
  out.push('')
  out.push(`  ${paint('digite o numero, ou escreva a resposta · enter aceita o sugerido', DIM, o)}`)
  return out
}

export function renderRespondidas(id: string, perguntas: { q: string; answer?: string }[], o: OpcoesClarify = {}): string[] {
  const respondidas = perguntas.filter(p => p.answer)
  if (!respondidas.length) return [`  #${id} nao tem pergunta nem resposta`]
  const out: string[] = ['', `  ${paint(`#${id} — decisoes que voce tomou`, BOLD, o)}`, '']
  for (const p of respondidas) {
    for (const linha of quebrar(p.q, 66)) out.push(`  ${paint(linha, DIM, o)}`)
    out.push(`    ${paint('→', ACC, o)} ${p.answer}`)
    out.push('')
  }
  return out
}

export function quebrar(texto: string, largura: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean)
  const linhas: string[] = []
  let atual = ''
  for (const p of palavras) {
    if (atual && (atual + ' ' + p).length > largura) {
      linhas.push(atual)
      atual = p
    } else {
      atual = atual ? `${atual} ${p}` : p
    }
  }
  if (atual) linhas.push(atual)
  return linhas.length ? linhas : ['']
}
