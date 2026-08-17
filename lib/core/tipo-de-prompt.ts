const ACAO = new RegExp('\\b(' + [
  'cri[ae]r?', 'adicion[ae]r?', 'inclu[ai]r?', 'remov[ae]r?', 'apag[ae]r?', 'delet[ae]r?',
  'corrig[ei]r?', 'ajust[ae]r?', 'arrum[ae]r?', 'consert[ae]r?', 'mud[ae]r?', 'alter[ae]r?',
  'troc[ae]r?', 'implement[ae]r?', 'refator[ae]r?', 'atualiz[ae]r?', 'migr[ae]r?',
  'renome[ae]r?', 'mov[ae]r?', 'public[ae]r?', 'instal[ae]r?', 'configur[ae]r?',
  'padroniz[ae]r?', 'otimiz[ae]r?', 'deix[ae]r?', 'coloc[ae]r?', 'p[oô]r', 'faz', 'fazer',
  'escrev[ae]r?', 'ger[ae]r?', 'aplic[ae]r?', 'integr[ae]r?', 'valid[ae]r?', 'document[ae]r?',
].join('|') + ')\\b', 'i')

const CONSULTA = new RegExp('^\\s*(' + [
  'tem', 'temos', 'tinha', 'ha', 'havia', 'existe', 'existem',
  'qual', 'quais', 'quanto', 'quantos', 'quantas', 'quem', 'onde', 'quando',
  'por ?que', 'porque', 'pra ?que', 'para ?que', 'como',
  'sera', 'seria', 'sabe', 'sabia', 'conhece', 'e possivel', 'e viavel',
  'o que', 'oque', 'posso', 'devo', 'preciso', 'vale', 'voce', 'vc',
].join('|') + ')\\b', 'i')

const PEDIDO = new RegExp('^\\s*(' + [
  'pode', 'podes', 'poderia', 'podemos', 'consegue', 'conseguiria', 'consegues',
  'da pra', 'da para', 'daria pra', 'daria para', 'quero', 'gostaria', 'favor', 'por favor',
].join('|') + ')\\b', 'i')

const CONSULTA_MEIO = /\b(tem acesso|temos acesso|ja existe|ja tem|faz sentido|o que (e|significa)|como funciona|qual (e|o|a))\b/i

function semAcento(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export type TipoDePrompt = 'task' | 'ask'

export type Confianca = 'alta' | 'baixa'

export interface LeituraDaEntrada {
  tipo: TipoDePrompt
  motivo: string
  confianca: Confianca
}

export const TIPOS: Record<TipoDePrompt, string> = {
  task: 'pedido de mudanca no projeto — vira card e roda o pipeline',
  ask: 'pergunta — o hii executa tarefas, entao nao entra na fila',
}

export function lerEntrada(bruto: string): LeituraDaEntrada {
  const texto = semAcento(bruto).trim()
  if (!texto) return { tipo: 'ask', motivo: 'vazio', confianca: 'alta' }

  const consulta = CONSULTA.test(texto) || CONSULTA_MEIO.test(texto)
  if (consulta) {
    return { tipo: 'ask', motivo: 'abre consultando — o verbo de acao adiante e finalidade, nao pedido', confianca: 'alta' }
  }

  const temAcao = ACAO.test(texto)
  if (PEDIDO.test(texto)) {
    return temAcao
      ? { tipo: 'task', motivo: 'pedido com verbo de mudanca', confianca: 'alta' }
      : { tipo: 'ask', motivo: 'pedido sem verbo de mudanca — pergunta de viabilidade', confianca: 'alta' }
  }

  if (temAcao) return { tipo: 'task', motivo: 'tem verbo de mudanca', confianca: 'alta' }
  if (texto.endsWith('?')) return { tipo: 'ask', motivo: 'termina em interrogacao', confianca: 'baixa' }
  return { tipo: 'task', motivo: 'sem sinal claro — nem pergunta nem verbo de mudanca', confianca: 'baixa' }
}

export function pareceTarefa(bruto: string): boolean {
  return lerEntrada(bruto).tipo === 'task'
}
