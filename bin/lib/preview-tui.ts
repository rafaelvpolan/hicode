import { existsSync } from 'node:fs'
import { PREVIEW_BASE_PORT } from '../../lib/runner/config'
import { readCard, repoPath } from '../../lib/runner/card-store'
import { ensurePreview, hasDevServer, httpOk, previewPort, stopPreview, waitHttp } from '../../lib/runner/preview'
import { inventario, orfaos, planejarPreview } from '../../lib/core/previews'
import * as core from '../../lib/core/actions'
import { dim } from './saida'
import { todosOsCards } from './dados'

export async function listarPreviews(limpar: boolean): Promise<string[]> {
  const cards = todosOsCards()
  const vivos: string[] = []
  for (const c of cards) {
    const url = c.preview_url || ''
    if (url && await httpOk(url)) vivos.push(url)
  }
  const portas = inventario({ cards, base: PREVIEW_BASE_PORT, vivo: (u) => vivos.includes(u) })
  if (!portas.length) return ['  nenhum preview rodando']
  const out = portas.map(p => {
    const marca = p.situacao === 'orfao' ? 'orfao' : 'em uso'
    return `  ${p.url}  ${dim(`#${p.cardId} ${p.status.toLowerCase()} · ${marca}`)}`
  })
  const soltos = orfaos(portas)
  if (!soltos.length) return out
  if (!limpar) {
    out.push(dim(`  ${soltos.length} orfao(s) — /preview --limpar derruba`))
    return out
  }
  for (const p of soltos) {
    stopPreview(p.pid)
    core.setPreviewPid(p.cardId, 0)
  }
  out.push(dim(`  ${soltos.length} orfao(s) derrubado(s)`))
  return out
}

export async function contextoPreview(id: string): Promise<{ url: string; vivo: boolean; temDev: boolean; plano: ReturnType<typeof planejarPreview> }> {
  const card = readCard(id)
  if (!card) return { url: '', vivo: false, temDev: false, plano: { acao: 'nada', url: '', motivo: 'card nao encontrado' } }
  const alvo = repoPath(card.fm.repo ?? '')
  const temDev = existsSync(alvo) && hasDevServer(alvo)
  const url = card.fm.preview_url || (temDev ? `http://localhost:${previewPort(id)}` : '')
  const vivo = url ? await httpOk(url) : false
  const plano = planejarPreview({
    status: card.fm.status ?? '',
    worktree: card.fm.worktree ?? '',
    url, vivo, temDevServer: temDev,
  })
  return { url, vivo, temDev, plano }
}

export async function subirPreview(id: string): Promise<string> {
  const card = readCard(id)
  if (!card) return `card #${id} nao encontrado`
  const alvo = repoPath(card.fm.repo ?? '')
  if (!existsSync(alvo)) return `clone de ${card.fm.repo} nao encontrado`
  if (!hasDevServer(alvo)) return `${card.fm.repo} nao tem script de dev — nao ha preview`
  const wt = card.fm.worktree ?? ''
  if (!wt || !existsSync(wt)) {
    return `#${id} ainda nao tem worktree — o preview sobe quando a tarefa executar`
  }
  const porta = previewPort(id)
  const url = `http://localhost:${porta}`
  if (await httpOk(url)) return `#${id} ja esta no ar → ${url}`
  const handle = await ensurePreview(wt, porta, alvo, card.fm.preview_pid)
  if (!handle.pid) return `nao consegui subir o preview de #${id}`
  core.setPreviewPid(id, handle.pid)
  const subiu = await waitHttp(url, 30)
  return subiu ? `#${id} no ar → ${url}` : `#${id} iniciado (pid ${handle.pid}), mas ${url} ainda nao responde`
}
