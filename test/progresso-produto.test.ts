import { test, expect } from 'bun:test'
import { createHash } from 'node:crypto'
import { novaDescoberta } from '../panel/shared/planejamento'
import type { RevisaoDePlanejamento } from '../panel/shared/planejamento'
import { modeloTecnico } from '../panel/shared/tecnico'
import type { RevisaoTecnica } from '../panel/shared/tecnico'
import { serializarTecnico } from '../panel/shared/contrato-tecnico'
import type { DocumentoTecnico } from '../panel/shared/contrato-tecnico'
import type { AvaliacaoDeExecucao } from '../panel/shared/avaliacao-hii'
import { progressoDaTarefa } from '../panel/server/hii/progresso-produto'
import { conclusaoDoEpico, estadoDaExecucao } from '../panel/shared/progresso-produto'
function fixture() {
  const tarefa = { id: 'triagem', titulo: 'Triagem', resultado: 'Registrar categoria correta', prioridade: 'alta' as const,
    justificativa: 'Desbloqueia atendimento', dependeDe: [] as string[], criterios: ['Entrada conhecida recebe a categoria esperada'] }
  const p: RevisaoDePlanejamento = { revisao: 3, hash: 'planejamento', descobertaAprovada: true, revisaoDaSintese: 1, publicadoEm: '',
    documento: { versao: 1, id: 'principal', repo: 'org/app', descoberta: novaDescoberta(), epico: { problema: 'Entradas sem categoria',
      objetivo: 'Classificar', publico: 'Equipe', resultado: 'Categoria correta', metrica: 'Taxa de erro', escopo: 'Entradas novas',
      exclusoes: 'Entradas antigas', hipoteses: 'Melhorar triagem', perguntas: 'Quais categorias?', tarefas: [tarefa] } } }
  const d = JSON.parse(modeloTecnico(p, tarefa)) as DocumentoTecnico
  d.riscos = 'Categoria incorreta exige reversao'
  for (const c of d.criterios) { c.resultado = 'Categoria esperada aparece na consulta'; c.verificacao = 'Executar teste de entrada conhecida' }
  d.microtasks[0]!.saida = 'Codigo e testes da classificacao'
  for (const campo of Object.keys(d.operacao) as (keyof typeof d.operacao)[]) d.operacao[campo] = 'Conferir piloto e reverter em caso de falha'
  const fonte = serializarTecnico(d)
  const hash = createHash('sha256').update(fonte).digest('hex')
  const tecnico: RevisaoTecnica = { revisao: 1, fonte, hash, aprovada: true, criadaEm: '',
    envio: { chave: 'envio', estado: 'confirmado', sessao: '001', execucao: '002', status: 'EXECUTING' } }
  const a: AvaliacaoDeExecucao = { versao: 1, execucao: '002', repo: 'org/app', sessao: '001', status: 'MERGED', modo: 'passivo',
    plano: { revisao: 1, hash: 'plano', produto: tarefa.id, planejamento: 'principal', origemRevisao: 3, tecnicoHash: hash },
    atualidade: 'atual', motivo: 'Verificada contra Git', consultadaEm: '', evidenciaEm: '', tentativa: 'tentativa',
    criteriosAprovados: true, criterios: [{ id: 'criterio-1', descricao: tarefa.criterios[0]!, obrigatorio: true, estado: 'aprovado',
      resultadoRegistrado: 'aprovado', comando: ['node', 'test.js'], exitCode: 0, timeout: false, duracaoMs: 1, saida: 'teste aprovado' }] }
  return { p, tarefa, tecnico, a }
}
test('merge com criterios atuais conclui produto; PR aberto aguarda revisao humana', async () => {
  const { p, tarefa, tecnico, a } = fixture()
  const pronto = await progressoDaTarefa(p, tarefa, tecnico, async () => a)
  expect(pronto.estado).toBe('concluida')
  expect(conclusaoDoEpico([pronto], 1)).toBe(true)
  a.status = 'PR_OPEN'
  const revisao = await progressoDaTarefa(p, tarefa, tecnico, async () => a)
  expect(revisao.estado).toBe('aguarda_revisao')
  expect(conclusaoDoEpico([revisao], 1)).toBe(false)
})
test('revisao ou fonte alterada e criterio descoberto sem cobertura impedem conclusao', async () => {
  const { p, tarefa, tecnico, a } = fixture()
  p.revisao++
  expect((await progressoDaTarefa(p, tarefa, tecnico, async () => a)).estado).toBe('revisao_pendente')
  p.revisao--
  const alterado = { ...tecnico, fonte: tecnico.fonte.replace('Codigo e testes', 'Implementacao e testes') }
  expect((await progressoDaTarefa(p, tarefa, alterado, async () => a)).estado).toBe('revisao_pendente')
  tarefa.criterios.push('Entradas duplicadas nao criam uma nova classificacao')
  expect((await progressoDaTarefa(p, tarefa, tecnico, async () => a)).estado).toBe('inconclusiva')
})
test('evidencia antiga, indisponivel ou somente historica nao encerra produto', async () => {
  const { p, tarefa, tecnico, a } = fixture()
  for (const atualidade of ['desatualizada', 'indisponivel', 'ausente', 'inconsistente'] as const) {
    const r = await progressoDaTarefa(p, tarefa, tecnico, async () => ({ ...a, atualidade }))
    expect(r.estado).toBe('inconclusiva')
    expect(conclusaoDoEpico([r], 1)).toBe(false)
  }
  const offline = await progressoDaTarefa(p, tarefa, tecnico, async () => { throw new Error('offline') })
  expect(offline.estado).toBe('inconclusiva')
})
test('escopo divergente nao expoe resposta, vinculo manual nao presume cobertura', async () => {
  const { p, tarefa, tecnico, a } = fixture()
  const fora = await progressoDaTarefa(p, tarefa, tecnico, async () => ({ ...a, repo: 'outra/app' }))
  expect(fora.avaliacao).toBeNull()
  expect(fora.estado).toBe('inconclusiva')
  const manual = await progressoDaTarefa(p, { ...tarefa, cardExistente: '002' }, null, async () => a)
  expect(manual.estado).toBe('inconclusiva')
})
test('rascunho novo e pagina parcial nunca reutilizam conclusao antiga', async () => {
  const { p, tarefa, tecnico, a } = fixture()
  const pronto = await progressoDaTarefa(p, tarefa, tecnico, async () => a)
  expect(conclusaoDoEpico([pronto], 2)).toBe(false)
  expect(conclusaoDoEpico([pronto, pronto], 2)).toBe(false)
  expect(conclusaoDoEpico([{ ...pronto, dependeDe: [pronto.id] }], 1)).toBe(false)
  expect(conclusaoDoEpico([{ ...pronto, dependeDe: ['inexistente'] }], 1)).toBe(false)
  const novo = await progressoDaTarefa(p, tarefa, { ...tecnico, revisao: 2, aprovada: false, envio: null }, async () => a)
  expect(novo.estado).toBe('revisao_pendente')
})
test('parada humana, falha de criterio e gateway terminal permanecem distintos', () => {
  const { a } = fixture()
  expect(estadoDaExecucao({ ...a, status: 'HALTED' })).toBe('interrompida')
  expect(estadoDaExecucao({ ...a, status: 'PAUSED' })).toBe('bloqueada')
  expect(estadoDaExecucao({ ...a, status: 'EXECUTING', criterios: [{ ...a.criterios[0]!, estado: 'reprovado' }], criteriosAprovados: false })).toBe('falhou')
  expect(estadoDaExecucao({ ...a, status: 'COMPLETED', modo: 'gateway', criteriosAprovados: false })).toBe('inconclusiva')
})
