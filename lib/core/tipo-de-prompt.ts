const RADICAIS = [
  'cri', 'adicion', 'inclu', 'remov', 'apag', 'delet', 'exclu',
  'corrig', 'corrij', 'ajust', 'arrum', 'consert', 'mud', 'alter', 'troc', 'troqu',
  'implement', 'refator', 'atualiz', 'migr', 'renome', 'renomei', 'mov', 'mud',
  'public', 'publiqu', 'instal', 'configur', 'padroniz', 'otimiz', 'melhor',
  'deix', 'coloc', 'coloqu', 'escrev', 'escrev', 'ger', 'aplic', 'apliqu',
  'integr', 'valid', 'test', 'document', 'verific', 'verifiqu', 'revis',
  'reduz', 'aument', 'diminu', 'alinh', 'centraliz', 'reorganiz', 'extra',
]

const SUFIXOS = 'ar|er|ir|a|e|i|o|ue|ei|ou|am|em|ando|endo|indo|ir|a-lo|e-lo'

const ACAO = new RegExp('\\b(?:' + RADICAIS.join('|') + ')(?:' + SUFIXOS + ')\\b|\\b(?:faz|fazer|faca|fa[cç]a|p[oô]r|poe|ponha|sobe|subir|suba)\\b', 'i')

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

const SUBORDINADA = /\b(sem|sem precisar|antes de|depois de|caso|se|para que|em vez de|ao inves de)\b/

function oracaoPrincipal(texto: string): string {
  const corte = texto.search(SUBORDINADA)
  return corte > 0 ? texto.slice(0, corte) : texto
}

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

  const temAcao = ACAO.test(oracaoPrincipal(texto))
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
