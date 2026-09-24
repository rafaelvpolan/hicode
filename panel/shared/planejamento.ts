export const CAMPOS_DESCOBERTA = {
  publico: 'Quem enfrenta esta dor?',
  dor: 'Qual problema precisa ser resolvido?',
  situacao: 'Como isso funciona hoje?',
  impacto: 'Qual e o impacto observado?',
  evidencias: 'Quais fontes ou exemplos sustentam os fatos?',
  hipoteses: 'Quais hipoteses ainda precisam ser verificadas?',
  perguntas: 'Quais perguntas podem mudar o escopo?',
  restricoes: 'Quais limites precisam ser respeitados?',
} as const
export type CampoDescoberta = keyof typeof CAMPOS_DESCOBERTA
export interface Descoberta {
  titulo: string
  respostas: Record<CampoDescoberta, string>
  decisoes: string
}
export interface TarefaDeProduto {
  id: string
  titulo: string
  resultado: string
  criterios: string[]
  prioridade: 'alta' | 'media' | 'baixa'
  justificativa: string
  dependeDe: string[]
  cardExistente?: string
  cancelada?: boolean
}
export interface EpicoDeProduto {
  problema: string
  objetivo: string
  publico: string
  resultado: string
  metrica: string
  escopo: string
  exclusoes: string
  hipoteses: string
  perguntas: string
  tarefas: TarefaDeProduto[]
}
export interface Planejamento {
  versao: 1
  id: string
  repo: string
  descoberta: Descoberta
  epico: EpicoDeProduto | null
}
export interface RevisaoDePlanejamento {
  revisao: number
  hash: string
  documento: Planejamento
  descobertaAprovada: boolean
  revisaoDaSintese: number | null
  publicadoEm: string
}
export interface ErroDePlanejamento { campo: string; mensagem: string }
export function novaDescoberta(): Descoberta {
  return { titulo: '', respostas: { publico: '', dor: '', situacao: '', impacto: '', evidencias: '', hipoteses: '', perguntas: '', restricoes: '' }, decisoes: '' }
}
export function pendenciasDaDescoberta(d: Descoberta): ErroDePlanejamento[] {
  const erros: ErroDePlanejamento[] = []
  if (!d.titulo.trim()) erros.push({ campo: 'titulo', mensagem: 'De um nome a demanda' })
  for (const [campo, pergunta] of Object.entries(CAMPOS_DESCOBERTA)) {
    if (!d.respostas[campo as CampoDescoberta].trim()) erros.push({ campo, mensagem: pergunta })
  }
  return erros
}
export function validarPlanejamento(p: Planejamento, aprovar = false): ErroDePlanejamento[] {
  const erros: ErroDePlanejamento[] = []
  const erro = (campo: string, mensagem: string): void => { erros.push({ campo, mensagem }) }
  if (!p || p.versao !== 1) return [{ campo: 'versao', mensagem: 'Versao 1 obrigatoria' }]
  if (typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(p.id)) erro('id', 'ID invalido')
  if (typeof p.repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(p.repo)) erro('repo', 'Projeto invalido')
  const d = p.descoberta
  if (!d || typeof d.titulo !== 'string' || typeof d.decisoes !== 'string' || !d.respostas ||
    Object.keys(CAMPOS_DESCOBERTA).some(c => typeof d.respostas[c as CampoDescoberta] !== 'string')) {
    erro('descoberta', 'Respostas e decisoes devem ser textos')
    return erros
  }
  if (aprovar) erros.push(...pendenciasDaDescoberta(d))
  if (!p.epico) return erros
  const e = p.epico
  for (const c of ['problema', 'objetivo', 'publico', 'resultado', 'metrica', 'escopo', 'exclusoes', 'hipoteses', 'perguntas'] as const) {
    if (typeof e[c] !== 'string' || !e[c].trim()) erro(`epico.${c}`, 'Campo obrigatorio')
  }
  if (!Array.isArray(e.tarefas) || !e.tarefas.length) { erro('epico.tarefas', 'Inclua pelo menos uma tarefa'); return erros }
  const ids = new Set<string>()
  for (const t of e.tarefas) {
    if (!t || typeof t.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(t.id) || ids.has(t.id)) { erro('tarefas.id', 'ID invalido ou duplicado'); continue }
    ids.add(t.id)
    if (![t.titulo, t.resultado, t.justificativa].every(s => typeof s === 'string' && s.trim())) erro(`tarefas.${t.id}`, 'Titulo, resultado e justificativa obrigatorios')
    if (!['alta', 'media', 'baixa'].includes(t.prioridade)) erro(`tarefas.${t.id}.prioridade`, 'Prioridade invalida')
    if (!Array.isArray(t.criterios) || !t.criterios.length || !t.criterios.every(s => typeof s === 'string' && s.trim().length >= 12)) erro(`tarefas.${t.id}.criterios`, 'Descreva criterios observaveis e o resultado esperado')
    if (!Array.isArray(t.dependeDe) || !t.dependeDe.every(s => typeof s === 'string') || new Set(t.dependeDe).size !== t.dependeDe.length) erro(`tarefas.${t.id}.dependeDe`, 'Dependencias invalidas')
    if (t.cardExistente !== undefined && t.cardExistente !== '' && !/^\d{3,12}$/.test(t.cardExistente)) erro(`tarefas.${t.id}.cardExistente`, 'ID do motor invalido')
    if (t.cancelada !== undefined && typeof t.cancelada !== 'boolean') erro(`tarefas.${t.id}.cancelada`, 'Cancelamento invalido')
  }
  if (erros.length) return erros
  const feitas = new Set<string>()
  for (const t of e.tarefas) if (t.dependeDe.some(id => !ids.has(id))) erro(`tarefas.${t.id}.dependeDe`, 'Dependencia ausente')
  const canceladas = new Set(e.tarefas.filter(t => t.cancelada).map(t => t.id))
  for (const t of e.tarefas) if (!t.cancelada && t.dependeDe.some(id => canceladas.has(id))) erro(`tarefas.${t.id}.dependeDe`, 'Tarefa ativa depende de tarefa cancelada')
  if (erros.length) return erros
  while (feitas.size < ids.size) {
    const prontas = e.tarefas.filter(t => !feitas.has(t.id) && t.dependeDe.every(id => feitas.has(id)))
    if (!prontas.length) { erro('epico.tarefas', `Ciclo entre ${e.tarefas.filter(t => !feitas.has(t.id)).map(t => t.id).join(', ')}`); break }
    prontas.forEach(t => feitas.add(t.id))
  }
  return erros
}
export function proporEpico(d: Descoberta): EpicoDeProduto {
  return { problema: d.respostas.dor, objetivo: '', publico: d.respostas.publico, resultado: '', metrica: '',
    escopo: '', exclusoes: d.respostas.restricoes, hipoteses: d.respostas.hipoteses, perguntas: d.respostas.perguntas, tarefas: [] }
}
