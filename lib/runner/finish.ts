import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { extractObjetivo, isoNow } from '../card'
import type { StepMap, Status } from '../card'
import { CARDS_DIR, MAX_REAJUSTE } from './config'
import { readCard, patchCard, repoPath, repoBase } from './card-store'
import { removeWorktree, run, runGit, worktreePath } from './git'
import { hasBuildScript, previewPort, httpOk, screenshot, startPreview, stopPreview, waitHttp } from './preview'
import { runStep, verifyVisual } from './claude'
import { updateRunSteps } from './runs'

const QUALITY: Array<[string, string, string]> = [
  ['Arquitetura', 'rufus', 'Melhore a arquitetura/refatore o codigo relacionado a: "%s" sem mudar o comportamento observavel. Se nao houver ganho claro, nao mude nada.'],
  ['Testes', 'testudo', 'Garanta cobertura de testes para: "%s". Escreva/ajuste testes se aplicavel ao projeto.'],
  ['Seguranca', 'escudo', 'Revise seguranca (OWASP, secrets, XSS, deps) do que foi alterado para: "%s". Corrija problemas criticos.'],
  ['Review', 'crivo', 'Revise adversarialmente (read-only) o diff atual vs a tarefa "%s". Aponte problemas; nao edite arquivos.'],
  ['Limpeza', 'pura', 'Remova comentarios de prosa do codigo alterado (preserve licenca, diretivas de tooling, TODO/ticket).'],
]

const stateFor: Record<string, Status> = {
  Arquitetura: 'REFINED',
  Testes: 'TESTS_GREEN',
  Seguranca: 'SEC_CLEARED',
  Review: 'REVIEWED',
  Limpeza: 'CLEANED',
}

export async function handleFinish(id: string): Promise<void> {
  const card = readCard(id)
  if (!card) return
  const repoName = card.fm.repo ?? ''
  const slug = card.fm.slug ?? ''
  const target = repoPath(repoName)
  const base = repoBase(repoName)
  const branch = card.fm.branch || `hicode/${id}-${slug}`
  const wt = card.fm.worktree || worktreePath(target, id, slug)
  const msg = `feat: ${card.fm.title ?? ''} (#${id})`
  const shotPath = join(CARDS_DIR, 'previews', String(id), 'preview.png')
  if (!existsSync(wt)) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} PREVIEW_OK->HALTED worktree ausente: ${wt}`)
    return
  }
  process.stdout.write(`[runner] #${id}: finalizando (qualidade Nexus + PR)\n`)
  const desc = extractObjetivo(card.body) || card.fm.title
  const fsteps: StepMap = {}
  for (const [step, agent, template] of QUALITY) {
    const instruction = template.replace('%s', desc ?? '')
    const r = await runStep(wt, agent, instruction)
    fsteps[step] = { time: r.time, cost: r.cost, tokens: r.tokens }
    patchCard(id, { status: stateFor[step] ?? 'HALTED' }, `${isoNow()} ${step} (${agent}): ${r.text || 'ok'} (custo $${r.cost.toFixed(4)} · ${r.tokens} tokens)`)
    process.stdout.write(`[runner] #${id}: ${step} (${agent}) $${r.cost.toFixed(4)}\n`)
  }
  if (hasBuildScript(target)) {
    const tb = Date.now()
    let b = await run('npm', ['run', 'build'], { cwd: wt, timeout: 240000 })
    const testesStep = fsteps.Testes ?? { time: 0, cost: 0, tokens: 0 }
    fsteps.Testes = { time: testesStep.time + Math.round((Date.now() - tb) / 1000), cost: testesStep.cost, tokens: testesStep.tokens }
    let reajuste = 0
    while (b.err && reajuste < MAX_REAJUSTE) {
      reajuste++
      const tr = Date.now()
      const detail = String(b.stderr || b.stdout || '').slice(0, 1500)
      const rr = await runStep(wt, 'rufus', `O build/typecheck/lint falhou. Saida:\n${detail}\nCorrija os erros de tipo/lint/build no codigo alterado sem mudar o comportamento. Nao use any nem unknown.`)
      b = await run('npm', ['run', 'build'], { cwd: wt, timeout: 240000 })
      const prev = fsteps.Reajuste ?? { time: 0, cost: 0, tokens: 0 }
      fsteps.Reajuste = { time: prev.time + Math.round((Date.now() - tr) / 1000), cost: prev.cost + rr.cost, tokens: prev.tokens + rr.tokens }
      patchCard(id, {}, `${isoNow()} REAJUSTE (${reajuste}/${MAX_REAJUSTE}, rufus): ${rr.text || 'ajustou'} (custo $${rr.cost.toFixed(4)} · ${rr.tokens} tokens)`)
      process.stdout.write(`[runner] #${id}: REAJUSTE ${reajuste} (rufus)\n`)
    }
    if (b.err) {
      patchCard(id, { status: 'HALTED' }, `${isoNow()} build->HALTED build falhou apos ${reajuste} reajuste(s)`)
      return
    }
    patchCard(id, {}, `${isoNow()} build (tsc + vite) exit=0${reajuste ? ` (apos ${reajuste} reajuste)` : ''}`)
  }
  const rport = previewPort(id)
  const rurl = `http://localhost:${rport}`
  let reval = { ok: true, reason: 'sem dev server (revalidacao pulada)', cost: 0, tokens: 0 }
  const rt = Date.now()
  if (hasBuildScript(target)) {
    let up = await httpOk(rurl)
    if (!up) {
      startPreview(wt, rport)
      up = await waitHttp(rurl, 25)
    }
    if (up) {
      await new Promise(r => setTimeout(r, 3000))
      await screenshot(id, rurl)
      reval = await verifyVisual(card, shotPath)
    }
  }
  fsteps.Revalidacao = { time: Math.round((Date.now() - rt) / 1000), cost: reval.cost || 0, tokens: reval.tokens || 0 }
  patchCard(id, { revalidacao: reval.ok ? 'ok' : 'falhou' }, `${isoNow()} revalidacao do projeto (vs objetivo): ${reval.ok ? 'OK' : 'FALHOU'} — ${reval.reason}`)
  if (!reval.ok) {
    updateRunSteps(id, fsteps)
    patchCard(id, { status: 'HALTED' }, `${isoNow()} CLEANED->HALTED revalidacao falhou: objetivo nao confirmado apos polimento (worktree + preview mantidos p/ inspecao)`)
    process.stdout.write(`[runner] #${id}: HALTED revalidacao (${reval.reason})\n`)
    return
  }
  const totals = updateRunSteps(id, fsteps)
  await runGit(wt, ['add', '-A'])
  await runGit(wt, ['-c', 'commit.gpgsign=false', 'commit', '-m', `chore: qualidade Nexus (#${id})`])
  const p = await runGit(wt, ['push', '-u', 'origin', branch])
  if (p.err) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} CLEANED->HALTED push falhou: ${String(p.stderr || '').slice(0, 120)}`)
    return
  }
  const body = `Gerado pelo motor hicode (agentes Nexus). Card #${id}.\n\n${(desc ?? '').slice(0, 500)}`
  const pr = await run('gh', ['pr', 'create', '--repo', repoName, '--base', base, '--head', branch, '--title', msg, '--body', body], { cwd: wt, timeout: 60000 })
  const url = String(pr.stdout || '').trim().split('\n').filter(Boolean).pop() || ''
  if (pr.err && !url) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} CLEANED->HALTED gh pr create falhou: ${String(pr.stderr || '').slice(0, 120)}`)
    return
  }
  stopPreview(card.fm.preview_pid)
  await removeWorktree(target, wt)
  patchCard(id, {
    status: 'PR_OPEN',
    pr_url: url,
    cost_usd: String(totals.cost || card.fm.cost_usd || ''),
    tokens_total: String(totals.tokens || card.fm.tokens_total || ''),
  }, `${isoNow()} REVIEWED->PR_OPEN ${url} (merge e do humano)`)
  process.stdout.write(`[runner] #${id}: PR_OPEN ${url}\n`)
}
