import { lerEntrada } from './tipo-de-prompt'
import type { LeituraDaEntrada, TipoDePrompt } from './tipo-de-prompt'

export type ConsultaDeTipo = (texto: string) => Promise<string>

export function classificadorLigado(): boolean {
  return (process.env.HICODE_CLASSIFY || 'off') === 'on'
}

export function promptDeClassificacao(texto: string): string {
  return [
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

export async function classificarPrompt(
  texto: string,
  consultar?: ConsultaDeTipo,
): Promise<LeituraDaEntrada> {
  const heuristica = lerEntrada(texto)
  if (heuristica.confianca === 'alta' || !consultar || !classificadorLigado()) return heuristica

  try {
    const rotulo = lerRotulo(await consultar(promptDeClassificacao(texto)))
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
