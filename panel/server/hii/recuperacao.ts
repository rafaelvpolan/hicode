import { createHash } from 'node:crypto'
import { existsSync, readFileSync, mkdirSync, realpathSync, lstatSync, readdirSync, chmodSync } from 'node:fs'
import { join, relative } from 'node:path'
import { cardsDir } from '../motor/ambiente'
import { splitFrontMatter } from '../card/frontmatter'
import { withFileLock, writeFileAtomic } from '../card/bloqueio'
import type { RecuperacaoDoPainel, PreviaRecuperacao, DiagnosticoRecuperacao } from '../../shared/recuperacao'

export class ErroRecuperacao extends Error {
  constructor(readonly status: number, mensagem: string) { super(mensagem) }
}
interface Pacote {
  versao: 1; origem: string; arquivo: string; repo: string; documento: string
  anexos: { nome: string; conteudo: string; sha256: string }[]
}
export interface Vinculo { versao: 1; origem: string; hash: string; estado: 'pendente' | 'confirmado'; tarefa: string; arquivo: string }
const sha = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex')
export function arquivoDoVinculo(arquivo: string): string { return join(cardsDir(), 'recuperacao', sha(arquivo) + '.json') }
export function lerVinculo(arquivo: string): Vinculo | null {
  const path = arquivoDoVinculo(arquivo)
  if (!existsSync(path)) return null
  try {
    const v = JSON.parse(readFileSync(path, 'utf8')) as Vinculo
    if (!v || v.versao !== 1 || v.arquivo !== arquivo || !/^[a-f0-9]{64}$/.test(v.hash) ||
      !/^[a-f0-9]{64}$/.test(v.origem) || !['pendente', 'confirmado'].includes(v.estado) ||
      (v.estado === 'confirmado' ? !/^\d{3,12}$/.test(v.tarefa) : v.tarefa !== '')) throw new Error('identidade invalida')
    return v
  } catch { throw new ErroRecuperacao(409, 'Vinculo inconsistente; original preservado.') }
}
export function resumoDoVinculo(arquivo: string): import('../../shared/types').CardView['recuperacao'] {
  try { return lerVinculo(arquivo) }
  catch { return { estado: 'inconsistente', tarefa: '', erro: 'Vinculo ilegivel. Reconciliacao necessaria; original preservado.' } }
}
export async function chamarHii<T>(rota: string, corpo?: object, revisao = '', chave = '', signal?: AbortSignal): Promise<T> {
  const base = process.env.HII_API_URL || ''
  const token = process.env.HII_API_TOKEN || ''
  if (!base || token.length < 32) throw new ErroRecuperacao(503, 'Configure a API do HII no backend.')
  const endpoint = new URL(base)
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new ErroRecuperacao(503, 'Endereco da API invalido.')
  endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + rota
  let r: Response
  try { r = await fetch(endpoint, { method: corpo ? 'POST' : 'GET', redirect: 'error', signal: signal ?? AbortSignal.timeout(15000),
    headers: { authorization: 'Bearer ' + token, ...(corpo ? { 'content-type': 'application/json', 'idempotency-key': chave, 'if-match': revisao } : {}) },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}) }) }
  catch { throw new ErroRecuperacao(503, 'API sem confirmacao. A intencao foi preservada; diagnostique novamente antes de reenviar.') }
  if (!r.ok) {
    const b = await r.json().catch(() => null) as { erro?: { mensagem?: string } } | null
    throw new ErroRecuperacao(r.status, b?.erro?.mensagem || 'HII recusou a operacao (HTTP ' + r.status + ').')
  }
  return await r.json() as T
}
export function pacoteLocal(arquivo: string): Pacote {
  if (!/^\d{3,12}-[^/\\]+\.md$/.test(arquivo)) throw new ErroRecuperacao(400, 'Selecione o arquivo exato da tarefa.')
  const raiz = realpathSync(cardsDir())
  const path = join(raiz, arquivo)
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) throw new ErroRecuperacao(409, 'Arquivo ausente ou link nao permitido.')
  const documento = readFileSync(path, 'utf8')
  const { fm } = splitFrontMatter(documento)
  if (!fm.repo || !fm.id || !arquivo.startsWith(fm.id + '-')) throw new ErroRecuperacao(409, 'Identidade do card inconsistente.')
  const origem = sha(JSON.stringify([raiz, fm.repo, arquivo]))
  const anexos: Pacote['anexos'] = []
  let total = Buffer.byteLength(documento)
  const visitar = (dir: string, profundidade: number): void => {
    if (!existsSync(dir)) return
    if (profundidade > 6) throw new ErroRecuperacao(409, 'Artefatos excedem profundidade suportada; nada foi descartado.')
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome)
      const rel = relative(raiz, p).split('\\').join('/')
      const plano = rel === 'planos/' + sha(fm.repo!).slice(0, 24) + '-' + fm.id + '.json'
      const checkpoint = rel.startsWith('orquestracao/execucao-' + fm.id + '-') && /^orquestracao\/execucao-\d{3,12}-\d+\.json$/.test(rel)
      const pertence = plano || checkpoint || rel.split('/').some(parte => parte === fm.id || parte.startsWith(fm.id + '-') || parte.startsWith(fm.id + '.'))
      const stat = lstatSync(p)
      if (stat.isSymbolicLink()) { if (pertence) throw new ErroRecuperacao(409, 'Artefato por symlink exige reconciliacao: ' + rel); continue }
      if (stat.isDirectory()) { visitar(p, profundidade + 1); continue }
      if (!pertence || !stat.isFile()) continue
      if (total + stat.size > 1048576 || anexos.length >= 64) throw new ErroRecuperacao(413, 'Artefatos excedem o limite de transferencia; original preservado integralmente.')
      const bytes = readFileSync(p); total += bytes.length
      anexos.push({ nome: rel, conteudo: bytes.toString('base64'), sha256: sha(bytes) })
    }
  }
  for (const dir of ['runs', 'refs', 'answers', 'clarify', 'orquestracao', 'planos', 'evidencias', 'diagnosticos']) visitar(join(raiz, dir), 0)
  anexos.sort((a, b) => a.nome.localeCompare(b.nome))
  return { versao: 1, origem, arquivo, repo: fm.repo, documento, anexos }
}
export async function diagnosticarLocal(arquivo: string): Promise<RecuperacaoDoPainel> {
  const pacote = pacoteLocal(arquivo)
  const previa = await chamarHii<PreviaRecuperacao>('/v1/recuperacoes/previa', pacote)
  const vinculo = lerVinculo(arquivo)
  if (vinculo && vinculo.hash !== previa.hash) throw new ErroRecuperacao(409, 'Origem mudou depois do envio; preserve o original e reconcilie a alteracao.')
  const diagnostico = previa.tarefa ? await chamarHii<DiagnosticoRecuperacao>('/v1/tarefas/' + previa.tarefa + '/recuperacao') : null
  return { arquivo, previa, diagnostico, vinculo }
}
export async function importarLocal(arquivo: string, esperado: string): Promise<RecuperacaoDoPainel> {
  const pacote = pacoteLocal(arquivo)
  const atual = sha(JSON.stringify(pacote))
  if (atual !== esperado) throw new ErroRecuperacao(412, 'Origem mudou; gere outra previa.')
  if (!['PAUSED', 'HALTED', 'INBOX', 'READY'].includes(splitFrontMatter(pacote.documento).fm.status || '')) throw new ErroRecuperacao(409, 'Pare a tarefa de origem antes de recuperar.')
  const file = arquivoDoVinculo(arquivo)
  mkdirSync(join(cardsDir(), 'recuperacao'), { recursive: true, mode: 0o700 })
  withFileLock(join(cardsDir(), arquivo), () => {
    if (sha(JSON.stringify(pacoteLocal(arquivo))) !== esperado) throw new ErroRecuperacao(412, 'Origem mudou durante a preparacao.')
    withFileLock(file, () => {
      const v = lerVinculo(arquivo)
      if (v && v.hash !== esperado) throw new ErroRecuperacao(409, 'Ja existe outra intencao de recuperacao.')
      if (!v) { writeFileAtomic(file, JSON.stringify({ versao: 1, origem: pacote.origem, arquivo, hash: esperado, estado: 'pendente', tarefa: '' })); chmodSync(file, 0o600) }
    })
  })
  const encontrada = await chamarHii<PreviaRecuperacao>('/v1/recuperacoes/previa', pacote)
  const previa = encontrada.tarefa && encontrada.hash === esperado ? encontrada : await chamarHii<PreviaRecuperacao>('/v1/recuperacoes/importar', { pacote, hash: esperado }, '', 'recuperar-' + esperado)
  if (!previa.tarefa || previa.origem !== pacote.origem || previa.hash !== esperado) throw new ErroRecuperacao(409, 'Confirmacao do motor diverge da intencao.')
  withFileLock(file, () => {
    const v = lerVinculo(arquivo)!
    if (v.hash !== esperado || (v.tarefa && v.tarefa !== previa.tarefa)) throw new ErroRecuperacao(409, 'Vinculo mudou durante a confirmacao.')
    writeFileAtomic(file, JSON.stringify({ ...v, estado: 'confirmado', tarefa: previa.tarefa })); chmodSync(file, 0o600)
  })
  return diagnosticarLocal(arquivo)
}
export async function prepararLocal(arquivo: string, revisao: string, fingerprint: string): Promise<RecuperacaoDoPainel> {
  const v = lerVinculo(arquivo)
  if (!v?.tarefa || v.estado !== 'confirmado') throw new ErroRecuperacao(409, 'Confirme o vinculo primeiro.')
  await chamarHii('/v1/tarefas/' + v.tarefa + '/preparar-recuperacao', { fingerprint }, revisao, 'preparar-' + sha(JSON.stringify([v.origem, revisao, fingerprint])))
  return diagnosticarLocal(arquivo)
}
export async function agirNoVinculo(arquivo: string, acao: 'retomar' | 'parar'): Promise<Record<string, string>> {
  const v = lerVinculo(arquivo)
  if (!v?.tarefa || v.estado !== 'confirmado') throw new ErroRecuperacao(409, 'Vinculo ainda nao confirmado; diagnostique a recuperacao.')
  const rota = '/v1/tarefas/' + v.tarefa
  const t = await chamarHii<{ etag: string; campos: Record<string, string> }>(rota)
  await chamarHii(rota + '/acoes', { acao }, t.etag, acao + '-' + sha(JSON.stringify([v.origem, t.etag])))
  return (await chamarHii<{ campos: Record<string, string> }>(rota)).campos
}

export async function estadoComVinculos<T extends { cards: import('../../shared/types').CardView[] }>(estado: T): Promise<T> {
  const signal = AbortSignal.timeout(5000)
  const projetar = async (card: import('../../shared/types').CardView): Promise<import('../../shared/types').CardView> => {
    try {
      const v = card.arquivo ? lerVinculo(card.arquivo) : null
      if (!v?.tarefa || v.estado !== 'confirmado') return card
      const { campos } = await chamarHii<{ campos: Record<string, string> }>('/v1/tarefas/' + v.tarefa, undefined, '', '', signal)
      if (campos.recuperacao_origem !== v.origem || campos.repo !== card.repo) throw new ErroRecuperacao(409, 'Identidade remota diverge do vinculo.')
      const { statusCanonicoOuNulo } = await import('../../shared/status')
      const status = statusCanonicoOuNulo(campos.status)
      if (!status) throw new ErroRecuperacao(409, 'Estado do motor nao reconhecido.')
      return { ...card, status, cost_usd: campos.cost_usd || card.cost_usd, cost_floor: campos.cost_floor || '',
        cost_unverified: campos.cost_unverified || '', tokens_total: campos.tokens_total || card.tokens_total,
        halt_reason: campos.halt_reason || '', pr_url: campos.pr_url || card.pr_url }
    } catch { return { ...card, halt_reason: 'Estado remoto sem confirmacao. Consulte a recuperacao; o original permanece preservado.' } }
  }
  const cards = [...estado.cards]
  let proximo = 0
  await Promise.all(Array.from({ length: Math.min(4, cards.length) }, async () => {
    while (proximo < cards.length) {
      const indice = proximo++
      cards[indice] = await projetar(cards[indice]!)
    }
  }))
  return { ...estado, cards }
}
