import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import type { StatusMotorApi } from '../../shared/estado-motor'
import { cardsDir } from '../motor/ambiente'

export async function consultarStatusMotor(): Promise<StatusMotorApi> {
  const base: StatusMotorApi = { estado: 'nao_configurado', versao: null, versaoEmExecucao: null, consultadoEm: new Date().toISOString(), motivo: 'Configure HII_API_URL e HII_API_TOKEN no backend do Hicode.' }
  const url = process.env.HII_API_URL
  const token = process.env.HII_API_TOKEN
  if (!url || !token || token.length < 32) return base
  try {
    const endpoint = new URL(url)
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return { ...base, motivo: 'HII_API_URL invalida.' }
    endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + '/v1/motor/status'
    const r = await fetch(endpoint, { headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(3000), redirect: 'error' })
    if (r.status === 401 || r.status === 403) return { ...base, estado: 'nao_autorizado', motivo: 'API do HII recusou a credencial. Confira o token no backend.' }
    if (r.status === 404) return { ...base, estado: 'incompativel', motivo: 'Esta API do HII ainda nao oferece estado e versao. Atualize o motor.' }
    if (!r.ok) return { ...base, estado: 'indisponivel', motivo: 'API do HII respondeu com erro HTTP ' + r.status + '.' }
    const s = await r.json() as Partial<StatusMotorApi> & { protocolo?: number }
    if (s.protocolo !== 1 || !['ligado', 'desligado', 'degradado', 'desconhecido'].includes(s.estado || '') || typeof s.versao !== 'string' || !/^[a-f0-9]{64}$/.test(s.fila || '') || typeof s.motivo !== 'string' || typeof s.consultadoEm !== 'string' || !(s.versaoEmExecucao === null || typeof s.versaoEmExecucao === 'string')) {
      return { ...base, estado: 'incompativel', motivo: 'Resposta de estado do HII incompatível.' }
    }
    return { estado: s.estado!, versao: s.versao, versaoEmExecucao: s.versaoEmExecucao, motivo: s.motivo, consultadoEm: s.consultadoEm, fila: s.fila }
  } catch { return { ...base, estado: 'indisponivel', motivo: 'API do HII inacessivel. Nao foi possivel confirmar se o motor esta ligado ou desligado.' } }
}
export function filaLocal(): string {
  let caminho = resolve(cardsDir())
  try { caminho = realpathSync(caminho) } catch { /* fila ainda nao criada */ }
  return createHash('sha256').update(caminho).digest('hex')
}
export async function statusDaFilaLocal(): Promise<StatusMotorApi> {
  const s = await consultarStatusMotor()
  if (s.fila && s.fila !== filaLocal()) return { ...s, estado: 'fila_divergente', motivo: 'Hicode e HII apontam para filas diferentes. Configure HICODE_CARDS_DIR para a fila usada pelo HII; a tarefa nao foi enviada.' }
  return s
}
export class MotorIndisponivel extends Error {
  readonly statusCode = 503
  constructor(readonly status: StatusMotorApi) { super(status.motivo) }
}
export async function comMotorDisponivel<T>(executar: () => T): Promise<T> {
  let status = await statusDaFilaLocal()
  if (status.estado === 'desligado' && process.env.HICODE_MOTOR_AUTOSTART === '1') {
    try {
      const endpoint = process.env.HII_API_URL!.replace(/\/$/, '') + '/v1/motor/iniciar'
      const r = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { authorization: 'Bearer ' + process.env.HII_API_TOKEN, 'content-type': 'application/json' }, body: '{}' })
      if (!r.ok) throw new Error('Partida recusada')
      status = await statusDaFilaLocal()
    } catch {
      throw new MotorIndisponivel({ ...status, estado: 'indisponivel', motivo: 'Partida do motor sem confirmação. Confira a permissão de autostart e o log do HII; consulte o status antes de reenviar.' })
    }
  }
  if (status.estado !== 'ligado') throw new MotorIndisponivel(status)
  return executar()
}

export async function iniciarCardPelaApi(id: string): Promise<Record<string, string>> {
  if (!/^\d{3,12}$/.test(id)) throw new Error('ID invalido')
  const { clienteHii } = await import('./client.mjs')
  const cliente = clienteHii(process.env.HII_API_URL!, process.env.HII_API_TOKEN!)
  const atual = await cliente.tarefa(id)
  const chave = 'hicode-iniciar-' + id + '-' + createHash('sha256').update(atual.etag).digest('hex')
  const endpoint = process.env.HII_API_URL!.replace(/\/$/, '') + '/v1/tarefas/' + id + '/acoes'
  const r = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
    authorization: 'Bearer ' + process.env.HII_API_TOKEN, 'content-type': 'application/json',
    'if-match': atual.etag, 'idempotency-key': chave,
  }, body: JSON.stringify({ acao: 'iniciar' }) })
  if (!r.ok) throw new Error('Motor recusou o inicio (HTTP ' + r.status + '). Consulte o estado antes de reenviar.')
  return (await cliente.tarefa(id)).valor.campos
}


interface RespostaClarify { q: string; answer: string }
interface PerguntaPendente { perguntaId: string | null; pendencia: { atual: { q: string; options: string[]; recommended?: string } } | null }

function clienteDoMotor() {
  if (!process.env.HII_API_URL || !process.env.HII_API_TOKEN) throw new Error('Motor HII não configurado.')
  return import('./client.mjs').then(({ clienteHii }) => clienteHii(process.env.HII_API_URL!, process.env.HII_API_TOKEN!))
}

export async function perguntaClarifyPelaApi(id: string): Promise<{ q: string; options: string[]; recommended: string }[]> {
  const cliente = await clienteDoMotor()
  const recurso = await cliente.perguntas(id) as { valor: PerguntaPendente }
  const atual = recurso.valor.pendencia?.atual
  return atual ? [{ q: atual.q, options: atual.options, recommended: atual.recommended || '' }] : []
}

export async function responderClarifyPelaApi(id: string, answers: RespostaClarify[]): Promise<Record<string, string>> {
  const cliente = await clienteDoMotor()
  const restantes = new Map(answers.map(item => [item.q, item.answer]))
  while (restantes.size) {
    const recurso = await cliente.perguntas(id) as { valor: PerguntaPendente; etag: string }
    const perguntaId = recurso.valor.perguntaId
    const pergunta = recurso.valor.pendencia?.atual.q
    if (!perguntaId || !pergunta) throw new Error('O motor não possui pergunta pendente para esta tarefa.')
    const texto = restantes.get(pergunta)
    if (!texto) throw new Error(`A pergunta atual do motor mudou: "${pergunta}". Atualize o painel.`)
    const chave = 'hicode-clarify-' + id + '-' + createHash('sha256').update(perguntaId + texto).digest('hex')
    await cliente.responderPergunta(id, perguntaId, texto, chave, recurso.etag)
    restantes.delete(pergunta)
  }
  return (await cliente.tarefa(id)).valor.campos
}
