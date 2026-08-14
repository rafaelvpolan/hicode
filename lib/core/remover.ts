import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { readCard, listRepos, findCardFile } from '../runner/card-store'
import { cardsDir } from '../runner/config'
import { stopPreview } from '../runner/preview'
import { removeWorktree } from '../runner/git'
import { remove } from './actions'

const EM_VOO = ['EXECUTING', 'CORRECTING']

export interface PlanoRemocao {
  id: string
  titulo: string
  status: string
  repo: string
  branch: string
  worktree: string
  previewPid: string
  runs: string[]
  bloqueio: string
  avisos: string[]
}

function runsDoCard(id: string): string[] {
  const dir = join(cardsDir(), 'runs')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f === `${id}.live.log` || f.startsWith(`${id}.`) || f.startsWith(`${id}-`))
}

export function planejarRemocao(id: string): PlanoRemocao | null {
  const card = readCard(id)
  if (!card) return null
  const fm = card.fm
  const status = fm.status ?? 'INBOX'
  const avisos: string[] = []
  if (fm.branch) avisos.push(`a branch ${fm.branch} fica — o commit nao se perde`)
  if (status === 'PR_OPEN') avisos.push('o PR continua aberto no GitHub — feche por la se nao quiser mais')
  return {
    id,
    titulo: fm.title ?? '',
    status,
    repo: fm.repo ?? '',
    branch: fm.branch ?? '',
    worktree: fm.worktree ?? '',
    previewPid: fm.preview_pid ?? '',
    runs: runsDoCard(id),
    bloqueio: EM_VOO.includes(status) ? `#${id} esta em ${status} — o motor esta gastando nele agora; pare antes com /halt ${id}` : '',
    avisos,
  }
}

export interface ResultadoRemocao {
  ok: boolean
  reason: string
  limpou: string[]
}

function caminhoDoAlvo(repo: string): string {
  return listRepos().find(r => r.name === repo)?.path ?? ''
}

export async function remover(id: string, force = false): Promise<ResultadoRemocao> {
  const plano = planejarRemocao(id)
  if (!plano) return { ok: false, reason: `card #${id} nao encontrado`, limpou: [] }
  if (plano.bloqueio && !force) return { ok: false, reason: plano.bloqueio, limpou: [] }
  const limpou: string[] = []
  if (plano.previewPid) {
    stopPreview(plano.previewPid)
    limpou.push(`preview parado (pid ${plano.previewPid})`)
  }
  const alvo = caminhoDoAlvo(plano.repo)
  if (plano.worktree && alvo && existsSync(plano.worktree)) {
    await removeWorktree(alvo, plano.worktree)
    limpou.push('worktree removido')
  }
  const dirRuns = join(cardsDir(), 'runs')
  for (const f of plano.runs) rmSync(join(dirRuns, f), { force: true })
  if (plano.runs.length) limpou.push(`${plano.runs.length} arquivo(s) de execucao`)
  if (!remove(id)) return { ok: false, reason: `card #${id} sumiu no meio da remocao`, limpou }
  limpou.push('card apagado')
  return { ok: true, reason: '', limpou }
}

export function existeCard(id: string): boolean {
  return !!findCardFile(id)
}
