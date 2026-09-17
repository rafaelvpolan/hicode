// Gerado de hii/motor/oswaldo/orquestracao/tecnico.ts; use scripts/sincronizar-tecnico.mjs.
export interface CriterioTecnico {
  id: string
  descricao: string
  resultado: string
  verificacao: string
  verificador?: 'build' | 'test' | 'lint' | 'typecheck'
  obrigatorio: boolean
  naoAplicavel?: string
}
export interface MicrotaskTecnica {
  id: string
  titulo: string
  instrucao: string
  saida: string
  agente: string
  ia?: { provedor: string; modelo?: string }
  dependeDe: string[]
  arquivos: string[]
  criterios: string[]
}
export interface DocumentoTecnico {
  versao: 1
  id: string
  repo: string
  produtoId: string
  origem: { planejamento: string; revisao: number }
  titulo: string
  solucao: string
  contexto: string
  escopo: string
  exclusoes: string
  referencias: string[]
  dependencias: string[]
  riscos: string
  risco: 'low' | 'high'
  criterios: CriterioTecnico[]
  microtasks: MicrotaskTecnica[]
  operacao: { e2e: string; observabilidade: string; logging: string; flags: string; ativacao: string; sucesso: string; interrupcao: string; reversao: string }
}
export interface ErroTecnico { campo: string; mensagem: string }
export function contarLinhasTecnicas(texto: string): number {
  return texto.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length
}
export function serializarTecnico(d: DocumentoTecnico): string {
  return JSON.stringify(d, (_chave, valor: string | number | boolean | object | null) => typeof valor === 'string' ? valor.replace(/\r\n/g, '\n') : valor, 2) + '\n'
}
const id = (v: string): boolean => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(v)
const texto = (v: string): boolean => typeof v === 'string' && v.trim().length > 0
const lista = (v: string[]): boolean => Array.isArray(v) && v.every(texto) && new Set(v).size === v.length
export function validarTecnico(d: DocumentoTecnico): ErroTecnico[] {
  const erros: ErroTecnico[] = []
  const exigir = (ok: boolean, campo: string, mensagem: string): void => { if (!ok) erros.push({ campo, mensagem }) }
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.versao !== 1) return [{ campo: 'versao', mensagem: 'Documento tecnico versao 1 obrigatorio' }]
  exigir(id(d.id), 'id', 'ID invalido')
  exigir(typeof d.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(d.repo), 'repo', 'Use owner/repo')
  exigir(id(d.produtoId), 'produtoId', 'Tarefa de produto obrigatoria')
  exigir(!!d.origem && id(d.origem.planejamento) && Number.isSafeInteger(d.origem.revisao) && d.origem.revisao > 0, 'origem', 'Planejamento e revisao aprovados obrigatorios')
  for (const campo of ['titulo', 'solucao', 'contexto', 'escopo', 'exclusoes', 'riscos'] as const) exigir(texto(d[campo]), campo, 'Campo obrigatorio')
  exigir(d.risco === 'low' || d.risco === 'high', 'risco', 'Use low ou high')
  exigir(lista(d.referencias), 'referencias', 'Lista de referencias obrigatoria')
  exigir(lista(d.dependencias) && d.dependencias.every(id), 'dependencias', 'IDs sem duplicacao')
  for (const campo of ['e2e', 'observabilidade', 'logging', 'flags', 'ativacao', 'sucesso', 'interrupcao', 'reversao'] as const) {
    exigir(!!d.operacao && texto(d.operacao[campo]) && d.operacao[campo].trim().length >= 12, `operacao.${campo}`, 'Descreva a verificacao/operacao ou justifique nao aplicavel')
  }
  if (!Array.isArray(d.criterios) || !d.criterios.length) erros.push({ campo: 'criterios', mensagem: 'Inclua criterios verificaveis' })
  else {
    const ids = new Set<string>()
    for (const c of d.criterios) {
      if (!c || !id(c.id)) { erros.push({ campo: 'criterios.id', mensagem: 'ID invalido' }); continue }
      exigir(!ids.has(c.id), `criterios.${c.id}`, 'ID duplicado'); ids.add(c.id)
      for (const campo of ['descricao', 'resultado', 'verificacao'] as const) exigir(texto(c[campo]) && c[campo].trim().length >= 12, `criterios.${c.id}.${campo}`, 'Descreva comportamento, resultado esperado e como verificar')
      if (c.verificador !== undefined) exigir(['build', 'test', 'lint', 'typecheck'].includes(c.verificador), `criterios.${c.id}.verificador`, 'Use um comando do contrato local')
      exigir(typeof c.obrigatorio === 'boolean', `criterios.${c.id}.obrigatorio`, 'Informe obrigatoriedade')
      if (c.naoAplicavel !== undefined) exigir(!c.obrigatorio && texto(c.naoAplicavel) && c.naoAplicavel.trim().length >= 12, `criterios.${c.id}.naoAplicavel`, 'Justifique; criterio obrigatorio nao admite dispensa')
    }
  }
  if (!Array.isArray(d.microtasks) || !d.microtasks.length) erros.push({ campo: 'microtasks', mensagem: 'Inclua microtarefas' })
  else {
    const ids = new Set<string>()
    for (const m of d.microtasks) {
      if (!m || !id(m.id)) { erros.push({ campo: 'microtasks.id', mensagem: 'ID invalido' }); continue }
      exigir(!ids.has(m.id), `microtasks.${m.id}`, 'ID duplicado'); ids.add(m.id)
      for (const campo of ['titulo', 'instrucao', 'saida', 'agente'] as const) exigir(texto(m[campo]), `microtasks.${m.id}.${campo}`, 'Campo obrigatorio')
      exigir(lista(m.dependeDe), `microtasks.${m.id}.dependeDe`, 'IDs sem duplicacao')
      exigir(lista(m.arquivos) && m.arquivos.every(a => !/^(?:[\\/]|[a-z]:)/i.test(a) && !a.split(/[\\/]/).includes('..') && !a.includes('\0')), `microtasks.${m.id}.arquivos`, 'Caminhos relativos dentro do projeto')
      exigir(lista(m.criterios) && m.criterios.length > 0 && Array.isArray(d.criterios) && m.criterios.every(c => d.criterios.some(v => v?.id === c)), `microtasks.${m.id}.criterios`, 'Referencia a criterio obrigatoria')
      if (m.ia !== undefined) exigir(!!m.ia && texto(m.ia.provedor) && (m.ia.modelo === undefined || texto(m.ia.modelo)), `microtasks.${m.id}.ia`, 'Provedor e modelo validos')
    }
    if (!erros.length) {
      for (const m of d.microtasks) exigir(m.dependeDe.every(dep => ids.has(dep)), `microtasks.${m.id}.dependeDe`, 'Dependencia ausente')
      const feitas = new Set<string>()
      while (!erros.length && feitas.size < ids.size) {
        const prontas = d.microtasks.filter(m => !feitas.has(m.id) && m.dependeDe.every(dep => feitas.has(dep)))
        exigir(prontas.length > 0, 'microtasks', 'Ciclo de dependencias')
        prontas.forEach(m => feitas.add(m.id))
      }
    }
  }
  return erros
}
export function analisarTecnico(fonte: string): { documento: DocumentoTecnico | null; erros: ErroTecnico[]; linhas: number } {
  const linhas = contarLinhasTecnicas(fonte)
  if (linhas > 500) return { documento: null, erros: [{ campo: 'documento', mensagem: `Limite de 500 linhas; recebido ${linhas}, sem truncamento` }], linhas }
  let documento: DocumentoTecnico
  try { documento = JSON.parse(fonte) as DocumentoTecnico }
  catch { return { documento: null, erros: [{ campo: 'documento', mensagem: 'JSON invalido' }], linhas } }
  return { documento, erros: validarTecnico(documento), linhas }
}
