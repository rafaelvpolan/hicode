import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isoNow } from '../card'
import type { Card, StepMap } from '../card'
import { MAX_CONFLICT } from './config'
import { patchCard } from './card-store'
import { runGit, withGitLock } from './git'
import { runStep } from './agent'
import { ensurePreview, hasDevServer, httpOk, inspectPreview, previewPort, waitHttp } from './preview'
import { isNonVisual } from './classify'
import { addMetric } from './finish-metrics'

export interface SyncResult {
  ok: boolean
  changed: boolean
  detail?: string
}

const MARCADORES = /^(<{7}|={7}|>{7})/m

async function arquivosComMarcador(wt: string, files: string[]): Promise<string[]> {
  const comMarcador: string[] = []
  for (const f of files) {
    try {
      if (MARCADORES.test(readFileSync(join(wt, f), 'utf8'))) comMarcador.push(f)
    } catch {
      comMarcador.push(f)
    }
  }
  return comMarcador
}

export async function syncWithBase(id: string, wt: string, base: string, desc: string, fsteps: StepMap, executar: typeof runStep = runStep): Promise<SyncResult> {
  await withGitLock(() => runGit(wt, ['fetch', 'origin', base]))
  const before = (await runGit(wt, ['rev-parse', 'HEAD'])).stdout.trim()
  const merge = await runGit(wt, ['merge', '--no-edit', `origin/${base}`])
  if (!merge.err) {
    const after = (await runGit(wt, ['rev-parse', 'HEAD'])).stdout.trim()
    const changed = before !== after
    patchCard(id, {}, `${isoNow()} sync: integrou origin/${base}${changed ? ' sem conflito' : ' (ja atualizado)'}`)
    return { ok: true, changed }
  }
  let attempt = 0
  while (attempt < MAX_CONFLICT) {
    attempt++
    const files = (await runGit(wt, ['diff', '--name-only', '--diff-filter=U'])).stdout.split('\n').filter(Boolean)
    const tr = Date.now()
    const rr = await executar(wt, 'limpio', `Conflito de merge ao integrar origin/${base} na branch. Resolva os conflitos nestes arquivos: ${files.join(', ')}. Preserve o objetivo "${desc}" E as mudancas de ${base}. Remova TODOS os marcadores de conflito (<<<<<<<, =======, >>>>>>>). Nao rode git.`, id)
    addMetric(fsteps, 'Conflito', { time: Math.round((Date.now() - tr) / 1000), cost: rr.cost, tokens: rr.tokens, costMeasured: rr.costMeasured })
    const marcadores = await arquivosComMarcador(wt, files)
    const naoExecutou = rr.ok ? '' : `o agente nao concluiu: ${(rr.text || 'sem detalhe').slice(0, 120)}`
    const pendente = naoExecutou || (marcadores.length ? `marcador de conflito ainda em ${marcadores.join(', ')}` : '')
    patchCard(id, {}, `${isoNow()} CONFLITO (${attempt}/${MAX_CONFLICT}, limpio): ${rr.text || 'resolveu'} — ${pendente || 'resolvido'}`)
    process.stdout.write(`[runner] #${id}: CONFLITO ${attempt} (limpio)\n`)
    if (!pendente) {
      if (files.length) await runGit(wt, ['add', ...files])
      const restou = (await runGit(wt, ['diff', '--name-only', '--diff-filter=U'])).stdout.trim()
      if (restou) continue
      const cm = await runGit(wt, ['-c', 'commit.gpgsign=false', 'commit', '--no-edit'])
      if (cm.err) return { ok: false, changed: false, detail: `commit da resolucao falhou: ${String(cm.stderr || '').split('\n')[0] ?? ''}` }
      return { ok: true, changed: true }
    }
  }
  await runGit(wt, ['merge', '--abort'])
  return { ok: false, changed: true }
}

export async function revalidate(id: string, card: Card, wt: string, target: string, fsteps: StepMap): Promise<boolean> {
  if (isNonVisual(card.fm.surface)) {
    patchCard(id, { revalidacao: 'n/a' }, `${isoNow()} revalidacao pulada — tarefa nao-visual (build/testes ja validaram)`)
    return true
  }
  let ok = true
  let reason = 'sem dev server (revalidacao pulada)'
  const rt = Date.now()
  if (hasDevServer(target)) {
    const rport = previewPort(id)
    const rurl = `http://localhost:${rport}`
    let up = await httpOk(rurl)
    if (!up) {
      await ensurePreview(wt, rport, target)
      up = await waitHttp(rurl, 25)
    }
    if (up) {
      const h = await inspectPreview(id, rurl, true)
      if (!h.conclusive) {
        reason = `preview no ar apos merge — verificacao humana (inspecao automatica indisponivel${h.detail ? ': ' + h.detail : ''})`
      } else {
        ok = h.ok
        reason = h.ok ? 'preview no ar apos merge — confira pelo link' : `preview com erro: ${h.detail}`
      }
    } else {
      reason = 'dev server nao respondeu (revalidacao pulada)'
    }
  }
  addMetric(fsteps, 'Revalidacao', { time: Math.round((Date.now() - rt) / 1000), cost: 0, tokens: 0 })
  patchCard(id, { revalidacao: ok ? 'ok' : 'falhou' }, `${isoNow()} revalidacao do projeto (vs objetivo, pos-merge): ${ok ? 'OK' : 'FALHOU'} — ${reason}`)
  return ok
}
