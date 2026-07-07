import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { extractObjetivo, isoNow } from '../card'
import type { StepMap, StepMetric, Card, VerifyResult } from '../card'
import { CARDS_DIR, MAX_REAJUSTE, MAX_CONFLICT } from './config'
import { readCard, patchCard, repoPath, repoBase } from './card-store'
import { removeWorktree, run, runGit, stageAll, withGitLock, worktreePath } from './git'
import { hasBuildScript, hasTestScript, previewPort, httpOk, screenshot, startPreview, stopPreview, waitHttp } from './preview'
import { runStep, verifyVisual } from './agent'
import { activeSteps } from './pipeline/config'
import { updateRunSteps } from './runs'
import { runCodefoxGate, persistGate, buildPrBody } from './codefox-gate'

interface SyncResult {
  ok: boolean
  changed: boolean
}

function addMetric(fsteps: StepMap, key: string, m: StepMetric): void {
  const p = fsteps[key] ?? { time: 0, cost: 0, tokens: 0 }
  fsteps[key] = { time: p.time + m.time, cost: p.cost + m.cost, tokens: p.tokens + m.tokens }
}

async function commitAll(wt: string, message: string): Promise<void> {
  await stageAll(wt)
  await runGit(wt, ['-c', 'commit.gpgsign=false', 'commit', '-m', message])
}

async function buildWithReajuste(id: string, wt: string, fsteps: StepMap, timeKey: string, reajusteKey: string): Promise<boolean> {
  const tb = Date.now()
  let b = await run('npm', ['run', 'build'], { cwd: wt, timeout: 240000 })
  addMetric(fsteps, timeKey, { time: Math.round((Date.now() - tb) / 1000), cost: 0, tokens: 0 })
  let reajuste = 0
  while (b.err && reajuste < MAX_REAJUSTE) {
    reajuste++
    const tr = Date.now()
    const detail = String(b.stderr || b.stdout || '').slice(0, 1500)
    const rr = await runStep(wt, 'rufus', `O build/typecheck/lint falhou. Saida:\n${detail}\nCorrija os erros de tipo/lint/build no codigo alterado sem mudar o comportamento. Nao use any nem unknown.`)
    b = await run('npm', ['run', 'build'], { cwd: wt, timeout: 240000 })
    addMetric(fsteps, reajusteKey, { time: Math.round((Date.now() - tr) / 1000), cost: rr.cost, tokens: rr.tokens })
    patchCard(id, {}, `${isoNow()} REAJUSTE (${reajuste}/${MAX_REAJUSTE}, rufus): ${rr.text || 'ajustou'} (custo $${rr.cost.toFixed(4)} · ${rr.tokens} tokens)`)
    process.stdout.write(`[runner] #${id}: REAJUSTE ${reajuste} (rufus)\n`)
  }
  if (!b.err) patchCard(id, {}, `${isoNow()} build (tsc + vite) exit=0${reajuste ? ` (apos ${reajuste} reajuste)` : ''}`)
  return !b.err
}

async function testGate(id: string, wt: string, target: string, fsteps: StepMap, label: string): Promise<boolean> {
  if (!hasTestScript(target)) {
    patchCard(id, {}, `${isoNow()} ${label}: alvo sem script de teste — gate de teste pulado`)
    return true
  }
  const tb = Date.now()
  let t = await run('npm', ['test'], { cwd: wt, timeout: 240000 })
  addMetric(fsteps, label, { time: Math.round((Date.now() - tb) / 1000), cost: 0, tokens: 0 })
  let reajuste = 0
  while (t.err && reajuste < MAX_REAJUSTE) {
    reajuste++
    const tr = Date.now()
    const detail = String(t.stderr || t.stdout || '').slice(0, 1500)
    const rr = await runStep(wt, 'testudo', `Os testes do projeto falharam. Saida:\n${detail}\nCorrija os testes ou o codigo alterado sem mudar o comportamento pretendido. Nao use any nem unknown.`)
    t = await run('npm', ['test'], { cwd: wt, timeout: 240000 })
    addMetric(fsteps, label, { time: Math.round((Date.now() - tr) / 1000), cost: rr.cost, tokens: rr.tokens })
    patchCard(id, {}, `${isoNow()} REAJUSTE testes (${reajuste}/${MAX_REAJUSTE}, testudo): ${rr.text || 'ajustou'} (custo $${rr.cost.toFixed(4)} · ${rr.tokens} tokens)`)
  }
  if (!t.err) patchCard(id, {}, `${isoNow()} ${label}: npm test exit=0${reajuste ? ` (apos ${reajuste} reajuste)` : ''}`)
  return !t.err
}

async function syncWithBase(id: string, wt: string, base: string, desc: string, fsteps: StepMap): Promise<SyncResult> {
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
    const rr = await runStep(wt, 'limpio', `Conflito de merge ao integrar origin/${base} na branch. Resolva os conflitos nestes arquivos: ${files.join(', ')}. Preserve o objetivo "${desc}" E as mudancas de ${base}. Remova TODOS os marcadores de conflito (<<<<<<<, =======, >>>>>>>). Nao rode git.`)
    addMetric(fsteps, 'Conflito', { time: Math.round((Date.now() - tr) / 1000), cost: rr.cost, tokens: rr.tokens })
    if (files.length) await runGit(wt, ['add', ...files])
    const unmerged = (await runGit(wt, ['diff', '--name-only', '--diff-filter=U'])).stdout.trim()
    patchCard(id, {}, `${isoNow()} CONFLITO (${attempt}/${MAX_CONFLICT}, limpio): ${rr.text || 'resolveu'} — ${unmerged ? 'ainda ha conflito' : 'resolvido'}`)
    process.stdout.write(`[runner] #${id}: CONFLITO ${attempt} (limpio)\n`)
    if (!unmerged) {
      await runGit(wt, ['-c', 'commit.gpgsign=false', 'commit', '--no-edit'])
      return { ok: true, changed: true }
    }
  }
  await runGit(wt, ['merge', '--abort'])
  return { ok: false, changed: true }
}

async function revalidate(id: string, card: Card, wt: string, target: string, shotPath: string, fsteps: StepMap): Promise<boolean> {
  let reval: VerifyResult = { ok: true, reason: 'sem dev server (revalidacao pulada)', cost: 0, tokens: 0 }
  const rt = Date.now()
  if (hasBuildScript(target)) {
    const rport = previewPort(id)
    const rurl = `http://localhost:${rport}`
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
  addMetric(fsteps, 'Revalidacao', { time: Math.round((Date.now() - rt) / 1000), cost: reval.cost || 0, tokens: reval.tokens || 0 })
  const pass = reval.ok || reval.conclusive === false
  const veredito = reval.ok ? 'OK' : (reval.conclusive === false ? 'INCONCLUSIVO (nao bloqueante)' : 'FALHOU')
  patchCard(id, { revalidacao: reval.ok ? 'ok' : (reval.conclusive === false ? 'inconclusivo' : 'falhou') }, `${isoNow()} revalidacao do projeto (vs objetivo, pos-merge): ${veredito} — ${reval.reason}`)
  return pass
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
  const resumeFrom = card.fm.resume_from ?? ''
  if (resumeFrom) patchCard(id, { resume_from: '' }, `${isoNow()} retomando finish a partir de ${resumeFrom}`)
  const steps = activeSteps(wt)
  const startIdx = resumeFrom ? Math.max(0, steps.findIndex(s => s.label === resumeFrom)) : 0
  process.stdout.write(`[runner] #${id}: finalizando (qualidade Nexus + PR)${resumeFrom ? ` a partir de ${resumeFrom}` : ''}\n`)
  const desc = extractObjetivo(card.body) || card.fm.title
  const fsteps: StepMap = {}
  for (const step of steps.slice(startIdx)) {
    const instruction = step.instruction.replace('%s', desc ?? '')
    const r = await runStep(wt, step.agent, instruction)
    fsteps[step.label] = { time: r.time, cost: r.cost, tokens: r.tokens }
    if (step.gate === 'test' && !(await testGate(id, wt, target, fsteps, step.label))) {
      updateRunSteps(id, fsteps)
      patchCard(id, { status: 'HALTED' }, `${isoNow()} ${step.label}->HALTED testes falharam apos reajuste(s)`)
      return
    }
    patchCard(id, { status: step.state }, `${isoNow()} ${step.label} (${step.agent}): ${r.text || 'ok'} (custo $${r.cost.toFixed(4)} · ${r.tokens} tokens)`)
    process.stdout.write(`[runner] #${id}: ${step.label} (${step.agent}) $${r.cost.toFixed(4)}\n`)
  }
  if (hasBuildScript(target) && !(await buildWithReajuste(id, wt, fsteps, 'Testes', 'Reajuste'))) {
    updateRunSteps(id, fsteps)
    patchCard(id, { status: 'HALTED' }, `${isoNow()} build->HALTED build falhou apos reajuste(s)`)
    return
  }
  await commitAll(wt, `chore: qualidade Nexus (#${id})`)
  const sync = await syncWithBase(id, wt, base, desc ?? '', fsteps)
  if (!sync.ok) {
    updateRunSteps(id, fsteps)
    patchCard(id, { status: 'HALTED' }, `${isoNow()} CLEANED->HALTED conflito com ${base} nao resolvido apos ${MAX_CONFLICT}x (precisa de voce)`)
    process.stdout.write(`[runner] #${id}: HALTED conflito com ${base}\n`)
    return
  }
  if (sync.changed) {
    if (hasBuildScript(target) && !(await buildWithReajuste(id, wt, fsteps, 'Conflito', 'Conflito'))) {
      updateRunSteps(id, fsteps)
      patchCard(id, { status: 'HALTED' }, `${isoNow()} CLEANED->HALTED build falhou apos merge com ${base}`)
      return
    }
    await commitAll(wt, `chore: integra ${base} (#${id})`)
  }
  if (!(await revalidate(id, card, wt, target, shotPath, fsteps))) {
    updateRunSteps(id, fsteps)
    patchCard(id, { status: 'HALTED' }, `${isoNow()} CLEANED->HALTED revalidacao falhou pos-merge: objetivo nao confirmado (worktree + preview mantidos p/ inspecao)`)
    process.stdout.write(`[runner] #${id}: HALTED revalidacao (pos-merge)\n`)
    return
  }
  const gate = await runCodefoxGate(wt, base, desc ?? '')
  addMetric(fsteps, 'Codefox', { time: 0, cost: gate.cost, tokens: gate.tokens })
  persistGate(id, gate)
  if (gate.verdict === 'BLOCKED') {
    updateRunSteps(id, fsteps)
    patchCard(id, { status: 'HALTED' }, `${isoNow()} REVIEWED->HALTED codefox gate BLOCKED: ${gate.reason} (worktree mantido p/ inspecao)`)
    process.stdout.write(`[runner] #${id}: HALTED codefox gate BLOCKED\n`)
    return
  }
  const totals = updateRunSteps(id, fsteps)
  const p = await withGitLock(() => runGit(wt, ['push', '-u', 'origin', branch]))
  if (p.err) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} CLEANED->HALTED push falhou: ${String(p.stderr || '').slice(0, 120)}`)
    return
  }
  const body = buildPrBody(id, desc ?? '', gate)
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
