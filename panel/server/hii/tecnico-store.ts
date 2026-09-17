import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cardsDir } from '../motor/ambiente'
import { withFileLock, writeFileAtomic } from '../card/bloqueio'
import { analisarTecnico } from '../../shared/contrato-tecnico'
import type { RevisaoTecnica, EnvioTecnico } from '../../shared/tecnico'
export class ErroTecnicoStore extends Error {
  constructor(readonly status: number, mensagem: string) { super(mensagem) }
}
interface Registro extends RevisaoTecnica { chave: string; assinatura: string }
interface Historico { versao: 1; revisoes: Registro[] }
const hash = (s: string): string => createHash('sha256').update(s).digest('hex')
function arquivo(repo: string, planejamento: string, produto: string): string {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || ![planejamento, produto].every(id => /^[a-zA-Z0-9_-]{1,128}$/.test(id))) throw new ErroTecnicoStore(400, 'Identidade invalida')
  return join(cardsDir(), 'tecnicos', hash(JSON.stringify([repo, planejamento, produto])) + '.json')
}
function ler(path: string): Historico {
  if (!existsSync(path)) return { versao: 1, revisoes: [] }
  const h = JSON.parse(readFileSync(path, 'utf8')) as Historico
  if (h.versao !== 1 || !Array.isArray(h.revisoes) || h.revisoes.some((r, i) => r.revisao !== i + 1 || hash(r.fonte) !== r.hash)) throw new ErroTecnicoStore(409, 'Historico tecnico inconsistente')
  return h
}
export function lerTecnico(repo: string, planejamento: string, produto: string): RevisaoTecnica | null {
  return ler(arquivo(repo, planejamento, produto)).revisoes.at(-1) ?? null
}
export function salvarTecnico(repo: string, planejamento: string, produto: string, fonte: string, esperada: number, chave: string, aprovar: boolean): RevisaoTecnica {
  if (typeof fonte !== 'string' || Buffer.byteLength(fonte) > 200000 || !Number.isSafeInteger(esperada) || esperada < 0 || !/^[a-zA-Z0-9-]{8,128}$/.test(chave)) throw new ErroTecnicoStore(400, 'Fonte, revisao ou chave invalida')
  const a = analisarTecnico(fonte)
  if (!a.documento || a.linhas > 500 || (aprovar && a.erros.length)) throw new ErroTecnicoStore(400, a.erros.map(e => `${e.campo}: ${e.mensagem}`).join('; '))
  if (a.documento.repo !== repo || a.documento.produtoId !== produto || a.documento.origem?.planejamento !== planejamento) throw new ErroTecnicoStore(403, 'Documento fora do escopo')
  const path = arquivo(repo, planejamento, produto)
  mkdirSync(join(cardsDir(), 'tecnicos'), { recursive: true })
  return withFileLock(path, () => {
    const h = ler(path)
    const assinatura = hash(JSON.stringify([fonte, esperada, aprovar]))
    const repetida = h.revisoes.find(r => r.chave === chave)
    if (repetida) {
      if (repetida.assinatura !== assinatura) throw new ErroTecnicoStore(409, 'Chave reutilizada para outra intencao')
      return repetida
    }
    if ((h.revisoes.at(-1)?.revisao ?? 0) !== esperada) throw new ErroTecnicoStore(412, 'Outro editor alterou o card. Releia e compare sua proposta.')
    const nova: Registro = { revisao: esperada + 1, fonte, hash: hash(fonte), aprovada: aprovar, criadaEm: new Date().toISOString(), chave, assinatura, envio: null }
    h.revisoes.push(nova)
    writeFileAtomic(path, JSON.stringify(h, null, 2))
    return nova
  })
}
export function iniciarEnvio(repo: string, planejamento: string, produto: string, revisao: number): RevisaoTecnica {
  const path = arquivo(repo, planejamento, produto)
  return withFileLock(path, () => {
    const h = ler(path)
    const atual = h.revisoes.at(-1)
    if (!atual || atual.revisao !== revisao) throw new ErroTecnicoStore(412, 'Revisao mudou; releia antes de despachar')
    if (!atual.aprovada) throw new ErroTecnicoStore(409, 'Aprove o card tecnico antes de despachar')
    atual.envio ??= { chave: hash(JSON.stringify([repo, planejamento, produto, revisao, atual.hash])), estado: 'pendente', sessao: '', execucao: '', status: '' }
    writeFileAtomic(path, JSON.stringify(h, null, 2))
    return atual
  })
}
export function registrarEnvio(repo: string, planejamento: string, produto: string, revisao: number, envio: EnvioTecnico): RevisaoTecnica {
  const path = arquivo(repo, planejamento, produto)
  return withFileLock(path, () => {
    const h = ler(path)
    const r = h.revisoes.find(r => r.revisao === revisao)
    if (!r?.envio || r.envio.chave !== envio.chave) throw new ErroTecnicoStore(409, 'Intencao de envio divergente')
    if (r.envio.estado === 'confirmado' && JSON.stringify(r.envio) !== JSON.stringify(envio)) throw new ErroTecnicoStore(409, 'Envio ja confirmado')
    r.envio = envio
    writeFileAtomic(path, JSON.stringify(h, null, 2))
    return r
  })
}
