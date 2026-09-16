import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cardsDir } from '../motor/ambiente'
import { withFileLock, writeFileAtomic } from '../card/bloqueio'
import { validarPlanejamento } from '../../shared/planejamento'
import type { Planejamento, RevisaoDePlanejamento, ErroDePlanejamento } from '../../shared/planejamento'

export class ErroPlanejamento extends Error {
  readonly status: number
  readonly campos: ErroDePlanejamento[]
  constructor(status: number, mensagem: string, campos: ErroDePlanejamento[] = []) { super(mensagem); this.status = status; this.campos = campos }
}
interface Registro extends RevisaoDePlanejamento { chave: string; assinatura: string }
interface Historico { versao: 1; revisoes: Registro[] }
function hash(s: string): string { return createHash('sha256').update(s).digest('hex') }
function caminho(repo: string, id: string): string {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new ErroPlanejamento(400, 'Identidade invalida')
  return join(cardsDir(), 'planejamento', `${hash(repo)}-${id}.json`)
}
function lerHistorico(repo: string, id: string): Historico {
  const path = caminho(repo, id)
  if (!existsSync(path)) return { versao: 1, revisoes: [] }
  const h = JSON.parse(readFileSync(path, 'utf8')) as Historico
  if (h.versao !== 1 || !Array.isArray(h.revisoes)) throw new ErroPlanejamento(409, 'Historico nao reconhecido')
  for (const [index, r] of h.revisoes.entries()) {
    if (r.revisao !== index + 1 || r.documento.repo !== repo || r.documento.id !== id || r.hash !== hash(JSON.stringify(r.documento))) throw new ErroPlanejamento(409, 'Historico inconsistente')
  }
  return h
}
export function lerPlanejamento(repo: string, id: string): RevisaoDePlanejamento | null {
  return lerHistorico(repo, id).revisoes.at(-1) ?? null
}
export function salvarPlanejamento(p: Planejamento, esperado: number, chave: string, aprovar: boolean): RevisaoDePlanejamento {
  const erros = validarPlanejamento(p, aprovar)
  if (erros.length) throw new ErroPlanejamento(400, 'Revise os campos indicados', erros)
  if (!Number.isSafeInteger(esperado) || esperado < 0 || typeof chave !== 'string' || !/^[a-zA-Z0-9-]{8,128}$/.test(chave)) throw new ErroPlanejamento(400, 'Revisao e chave obrigatorias')
  const path = caminho(p.repo, p.id)
  mkdirSync(join(cardsDir(), 'planejamento'), { recursive: true })
  return withFileLock(path, () => {
    const h = lerHistorico(p.repo, p.id)
    const assinatura = hash(JSON.stringify({ p, esperado, aprovar }))
    const repetida = h.revisoes.find(r => r.chave === chave)
    if (repetida) {
      if (repetida.assinatura !== assinatura) throw new ErroPlanejamento(409, 'Chave ja usada para outra intencao')
      return repetida
    }
    const anterior = h.revisoes.at(-1)
    if ((anterior?.revisao ?? 0) !== esperado) throw new ErroPlanejamento(412, 'Outro editor alterou o planejamento. Releia antes de salvar.')
    const descobertaIgual = anterior && JSON.stringify(anterior.documento.descoberta) === JSON.stringify(p.descoberta)
    const aprovada = aprovar || (!!descobertaIgual && anterior.descobertaAprovada)
    if (p.epico && !aprovada) throw new ErroPlanejamento(409, 'Aprove a sintese de descoberta antes de criar o epico')
    const nova: Registro = { revisao: esperado + 1, hash: hash(JSON.stringify(p)), documento: structuredClone(p),
      descobertaAprovada: aprovada, revisaoDaSintese: aprovar ? esperado + 1 : descobertaIgual ? anterior.revisaoDaSintese : null,
      publicadoEm: new Date().toISOString(), chave, assinatura }
    h.revisoes.push(nova)
    writeFileAtomic(path, JSON.stringify(h, null, 2) + '\n')
    return nova
  })
}
