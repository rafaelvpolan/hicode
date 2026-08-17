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

export type NaturezaDaEntrada = 'tarefa' | 'pergunta'

export interface LeituraDaEntrada {
  natureza: NaturezaDaEntrada
  motivo: string
}

export function lerEntrada(bruto: string): LeituraDaEntrada {
  const texto = semAcento(bruto).trim()
  if (!texto) return { natureza: 'pergunta', motivo: 'vazio' }

  const consulta = CONSULTA.test(texto) || CONSULTA_MEIO.test(texto)
  if (consulta) {
    return { natureza: 'pergunta', motivo: 'abre consultando (o verbo de acao adiante e finalidade, nao pedido)' }
  }

  const temAcao = ACAO.test(texto)
  if (PEDIDO.test(texto)) {
    return temAcao
      ? { natureza: 'tarefa', motivo: 'pedido com verbo de mudanca' }
      : { natureza: 'pergunta', motivo: 'pedido sem verbo de mudanca — pergunta de viabilidade' }
  }

  if (temAcao) return { natureza: 'tarefa', motivo: 'tem verbo de mudanca' }
  if (texto.endsWith('?')) return { natureza: 'pergunta', motivo: 'termina em interrogacao' }
  return { natureza: 'tarefa', motivo: 'relato de problema ou pedido direto' }
}

export function pareceTarefa(bruto: string): boolean {
  return lerEntrada(bruto).natureza === 'tarefa'
}
