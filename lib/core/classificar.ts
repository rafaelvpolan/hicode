import { lerEntrada } from './tipo-de-prompt'
import type { LeituraDaEntrada, TipoDePrompt } from './tipo-de-prompt'

export type ConsultaDeTipo = (texto: string) => Promise<string>

export function classificadorLigado(): boolean {
  return (process.env.HICODE_CLASSIFY || 'off') === 'on'
}

export interface TrocaAnterior {
  pergunta: string
  resposta: string
}

export function promptDeClassificacao(texto: string, conversa: TrocaAnterior[] = []): string {
  const antes = conversa.length
    ? ['CONVERSA ANTERIOR (a mensagem pode ser continuacao dela):',
       ...conversa.slice(-2).map(t => `  humano: ${t.pergunta}`), '']
    : []
  return [
    ...antes,
    'Classifique a mensagem do usuario em UMA palavra, sem pontuacao e sem explicar.',
    'Responda exatamente "task" se e um pedido para MUDAR codigo ou arquivos do projeto.',
    'Responda exatamente "ask" se e pergunta, duvida, comentario ou continuacao de conversa.',
    '',
    `MENSAGEM: ${texto}`,
    '',
    'Resposta (task ou ask):',
  ].join('\n')
}

export function lerRotulo(bruto: string): TipoDePrompt | null {
  const t = bruto.toLowerCase()
  const temTask = /\btask\b/.test(t)
  const temAsk = /\bask\b/.test(t)
  if (temTask === temAsk) return null
  return temTask ? 'task' : 'ask'
}

export function continuaConversa(texto: string, conversa: TrocaAnterior[]): boolean {
  if (!conversa.length) return false
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  return /^(estou me referindo|me refiro|quis dizer|era sobre|falo d|sobre o que|isso mesmo|nao,|sim,|e sobre)/.test(t)
}

export async function classificarPrompt(
  texto: string,
  consultar?: ConsultaDeTipo,
  conversa: TrocaAnterior[] = [],
): Promise<LeituraDaEntrada> {
  const heuristica = lerEntrada(texto)
  if (continuaConversa(texto, conversa)) {
    return { tipo: 'ask', motivo: 'continua a conversa anterior, nao pede mudanca', confianca: 'alta' }
  }
  if (heuristica.confianca === 'alta' || !consultar || !classificadorLigado()) return heuristica

  try {
    const rotulo = lerRotulo(await consultar(promptDeClassificacao(texto, conversa)))
    if (!rotulo) return heuristica
    return {
      tipo: rotulo,
      motivo: rotulo === heuristica.tipo
        ? `${heuristica.motivo} — a ia local concordou`
        : 'a ia local leu diferente do heuristico e prevaleceu',
      confianca: 'alta',
    }
  } catch {
    return heuristica
  }
}
