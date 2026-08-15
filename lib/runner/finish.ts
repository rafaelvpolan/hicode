import { existsSync } from 'node:fs'
import { extractObjetivo, isoNow } from '../card'
import type { StepMap, Card } from '../card'
import { CARD_BUDGET_USD, MAX_CONFLICT, maxReajuste, PROJECT_MEMORY } from './config'
import { appendProjectMemory } from './memory'
import { readCard, patchCard, repoPath, repoBase } from './card-store'
import { pushOwnedBranch, removeWorktree, run, runGit, stageAll, worktreePath } from './git'
import { pularCriacaoDePr } from './finish-pr'
import type { PushResult } from './git'
import { stopPreview } from './preview'
import { activeSteps } from './pipeline/config'
import { planSteps } from './analyze'
import { runGatedStep } from './gated'
import { updateRunSteps } from './runs'
import { runCodefoxGate, persistGate, buildPrBody, gateOutcome, gateHaltReason, withGateRetry } from './codefox-gate'
import { ensureContract } from '../contract/store'
import { podeAbrirPr } from '../core/doctor'
import { affectedPackage } from './commands'
import { addMetric, accumulatedTotals, haltForInspection, applyStepFailurePolicy } from './finish-metrics'
import { buildWithReajuste, testGate } from './finish-gates'
import type { RunCtx } from './finish-gates'
import { syncWithBase, revalidate } from './finish-sync'
import { resumeStart, RESUME_POST_STEPS } from './finish-resume'
import { runStep } from './agent'

async function commitAll(wt: string, message: string): Promise<void> {
  await stageAll(wt)
  await runGit(wt, ['-c', 'commit.gpgsign=false', 'commit', '-m', message])
}

function pushFailureDiagnostico(push: PushResult): string {
  if (push.failureReason === 'no-anchor') {
    return `push rejeitado (non-fast-forward) e este card nao tem push anterior nem PR registrado para provar que a branch remota e dele — reexecutar sozinho NAO resolve. Inspecione o historico remoto da branch e, se for mesmo deste card, apague-a no remoto para o motor recriar: ${push.detail}`
  }
  if (push.failureReason === 'diverged') {
    return `push recusado mesmo com --force-with-lease ancorado no ultimo push que este card conhece — a branch remota mudou desde entao (fixup humano ou outro processo); reexecutar sozinho NAO resolve, decida manualmente: ${push.detail}`
  }
  return `push falhou por um motivo que nao e non-fast-forward — reexecutar sozinho tende a repetir esta falha; confira autenticacao/permissao: ${push.detail}`
}

export async function handleFinish(id: string): Promise<void> {
  const card = readCard(id)
  if (!card) return
  if (CARD_BUDGET_USD > 0 && (parseFloat(card.fm.cost_usd || '0') || 0) > CARD_BUDGET_USD) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} PREVIEW_OK->HALTED orcamento excedido (US$${card.fm.cost_usd} > US$${CARD_BUDGET_USD}) antes do polimento — decida se continua`)
    return
  }
  const repoName = card.fm.repo ?? ''
  const slug = card.fm.slug ?? ''
  const target = repoPath(repoName)
  const base = repoBase(repoName)
  const branch = card.fm.branch || `hicode/${id}-${slug}`
  const wt = card.fm.worktree || worktreePath(target, id, slug)
  const msg = `feat: ${card.fm.title ?? ''} (#${id})`
  if (!existsSync(wt)) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} PREVIEW_OK->HALTED worktree ausente: ${wt}`)
    return
  }
  const resumeFrom = card.fm.resume_from ?? ''
  if (resumeFrom) patchCard(id, { resume_from: '' }, `${isoNow()} retomando finish a partir de ${resumeFrom}`)
  const desc = extractObjetivo(card.body) || card.fm.title
  const preflight = podeAbrirPr(target, repoName)
  if (preflight.severidade === 'erro') {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} PREVIEW_OK->HALTED preflight: ${preflight.detalhe}${preflight.conserto ? ` — conserto: ${preflight.conserto}` : ''} (nada foi gasto no polimento)`)
    process.stdout.write(`[runner] #${id}: HALTED preflight — ${preflight.detalhe}\n`)
    return
  }
  const contract = ensureContract(target, isoNow())
  const changed = (await runGit(wt, ['diff', '--name-only', `origin/${base}...HEAD`])).stdout.split('\n').filter(Boolean)
  const pkg = affectedPackage(contract, changed)
  const ctx: RunCtx = { contract, pkg, target }
  patchCard(id, {}, `${isoNow()} contrato: ${contract.stack}${pkg ? ` · pacote afetado: ${pkg.name}` : ''}`)
  const all = activeSteps(wt)
  const plan = planSteps({ title: card.fm.title, objetivo: desc, risk: card.fm.risk, surface: card.fm.surface, override: card.fm.steps }, all)
  const steps = plan.steps
  patchCard(id, { steps_profile: plan.profile }, `${isoNow()} analise de passos: perfil "${plan.profile}" — roda [${steps.map(s => s.label).join(', ') || 'nenhum'}]${plan.skipped.length ? ` · pula [${plan.skipped.join(', ')}]` : ''} (${plan.reason})`)
  const startIdx = resumeStart(steps, all, resumeFrom, id, plan.profile)
  process.stdout.write(`[runner] #${id}: finalizando (perfil ${plan.profile}: ${steps.length} passo(s)${plan.skipped.length ? `, pulou ${plan.skipped.length}` : ''})${resumeFrom ? ` a partir de ${resumeFrom}` : ''}\n`)
  const fsteps: StepMap = {}
  for (const step of steps.slice(startIdx)) {
    const instruction = step.instruction.replace('%s', desc ?? '')
    let r: { time: number; cost: number; tokens: number; text: string }
    if (step.gated) {
      const g = await runGatedStep(id, wt, base, step.agent, instruction, desc ?? '', step.label)
      r = { ...g.metric, text: g.text }
      if (!g.ok) {
        fsteps[step.label] = g.metric
        if (g.failureClass) {
          applyStepFailurePolicy(id, card, fsteps, {
            fromStatus: step.label,
            resumeStatus: 'PREVIEW_OK',
            resumeStep: step.label,
            provider: g.provider ?? '',
            failureClass: g.failureClass,
            failureReason: g.failureReason ?? 'falha nao classificada',
            technicalDetail: g.reason,
          })
          return
        }
        haltForInspection(id, card, fsteps, `${isoNow()} ${step.label}->HALTED gate crivo reprovou apos ${maxReajuste()} reajuste(s): ${g.reason}`)
        return
      }
    } else {
      const sr = await runStep(wt, step.agent, instruction, id)
      if (!sr.ok) {
        fsteps[step.label] = { time: sr.time, cost: sr.cost, tokens: sr.tokens }
        applyStepFailurePolicy(id, card, fsteps, {
          fromStatus: step.label,
          resumeStatus: 'PREVIEW_OK',
          resumeStep: step.label,
          provider: sr.provider ?? '',
          failureClass: sr.failureClass ?? 'terminal',
          failureReason: sr.failureReason ?? 'falha nao classificada',
          technicalDetail: `agente ${step.agent}: ${sr.text}`,
        })
        return
      }
      r = { time: sr.time, cost: sr.cost, tokens: sr.tokens, text: sr.text }
    }
    fsteps[step.label] = { time: r.time, cost: r.cost, tokens: r.tokens }
    if (step.gate === 'test' && !(await testGate(id, wt, ctx, fsteps, step.label))) {
      haltForInspection(id, card, fsteps, `${isoNow()} ${step.label}->HALTED testes falharam apos reajuste(s)`)
      return
    }
    patchCard(id, { status: step.state, wait_attempts: '' }, `${isoNow()} ${step.label} (${step.agent})${step.gated ? ' [crivo ok]' : ''}: ${r.text || 'ok'} (custo $${r.cost.toFixed(4)} · ${r.tokens} tokens)`)
    process.stdout.write(`[runner] #${id}: ${step.label} (${step.agent}) $${r.cost.toFixed(4)}\n`)
  }
  if (!(await buildWithReajuste(id, wt, ctx, fsteps, 'Testes', 'Reajuste'))) {
    haltForInspection(id, card, fsteps, `${isoNow()} build->HALTED build falhou apos reajuste(s)`)
    return
  }
  await commitAll(wt, `chore: qualidade Nexus (#${id})`)
  const sync = await syncWithBase(id, wt, base, desc ?? '', fsteps)
  if (!sync.ok) {
    haltForInspection(id, card, fsteps, `${isoNow()} CLEANED->HALTED conflito com ${base} nao resolvido apos ${MAX_CONFLICT}x (precisa de voce)`)
    process.stdout.write(`[runner] #${id}: HALTED conflito com ${base}\n`)
    return
  }
  if (sync.changed) {
    if (!(await buildWithReajuste(id, wt, ctx, fsteps, 'Conflito', 'Conflito'))) {
      haltForInspection(id, card, fsteps, `${isoNow()} CLEANED->HALTED build falhou apos merge com ${base}`)
      return
    }
    await commitAll(wt, `chore: integra ${base} (#${id})`)
  }
  if (!(await revalidate(id, card, wt, target, fsteps))) {
    haltForInspection(id, card, fsteps, `${isoNow()} CLEANED->HALTED revalidacao falhou pos-merge: objetivo nao confirmado (worktree + preview mantidos p/ inspecao)`)
    process.stdout.write(`[runner] #${id}: HALTED revalidacao (pos-merge)\n`)
    return
  }
  const gate = await withGateRetry(
    () => runCodefoxGate(wt, base, desc ?? ''),
    reason => patchCard(id, {}, `${isoNow()} codefox gate final: NAO EXECUTOU (${reason}) — repetindo antes de decidir`),
  )
  addMetric(fsteps, 'Codefox', { time: 0, cost: gate.cost, tokens: gate.tokens })
  persistGate(id, gate)
  if (gateOutcome(gate) === 'halt') {
    if (!gate.ok && gate.failureClass) {
      applyStepFailurePolicy(id, card, fsteps, {
        fromStatus: 'REVIEWED',
        resumeStatus: 'PREVIEW_OK',
        resumeStep: RESUME_POST_STEPS,
        provider: gate.provider ?? '',
        failureClass: gate.failureClass,
        failureReason: gate.failureReason ?? 'falha nao classificada',
        technicalDetail: gateHaltReason(gate),
      })
      process.stdout.write(`[runner] #${id}: codefox gate final nao concluiu (classificado)\n`)
      return
    }
    haltForInspection(id, card, fsteps, `${isoNow()} REVIEWED->HALTED ${gateHaltReason(gate)} (worktree mantido p/ inspecao)`)
    process.stdout.write(`[runner] #${id}: HALTED ${gate.ok ? 'codefox gate BLOCKED' : 'codefox gate nao concluiu'}\n`)
    return
  }
  updateRunSteps(id, fsteps)
  const totalsFields = accumulatedTotals(card, fsteps)
  const donoComprovado = !!String(card.fm.pr_url ?? '').trim()
  const push = await pushOwnedBranch(wt, branch, String(card.fm.pushed_sha ?? '').trim(), donoComprovado)
  if (!push.ok) {
    const diagnostico = pushFailureDiagnostico(push)
    patchCard(id, { status: 'HALTED', ...totalsFields }, `${isoNow()} CLEANED->HALTED ${diagnostico} (worktree mantido p/ inspecao)`)
    return
  }
  patchCard(id, { pushed_sha: push.pushedSha }, push.forced
    ? `${isoNow()} push: a branch remota tinha uma tentativa anterior deste mesmo card — sobrescrita com --force-with-lease ancorado no ultimo push conhecido`
    : `${isoNow()} push: branch atualizada`)
  const body = buildPrBody(id, desc ?? '', gate)
  const prExistente = String(card.fm.pr_url ?? '').trim()
  const pr = pularCriacaoDePr(prExistente)
    ? { err: null, stdout: prExistente, stderr: '' }
    : await run('gh', ['pr', 'create', '--repo', repoName, '--base', base, '--head', branch, '--title', msg, '--body', body], { cwd: wt, timeout: 60000 })
  if (pularCriacaoDePr(prExistente)) {
    patchCard(id, {}, `${isoNow()} PR ja aberto para esta branch — push atualizou ${prExistente}`)
  }
  const url = String(pr.stdout || '').trim().split('\n').filter(Boolean).pop() || ''
  if (pr.err && !url) {
    patchCard(id, { status: 'HALTED', ...totalsFields }, `${isoNow()} CLEANED->HALTED gh pr create falhou (push ja OK — so falta abrir o PR): ${String(pr.stderr || '').slice(0, 120)}`)
    return
  }
  stopPreview(card.fm.preview_pid)
  await removeWorktree(target, wt)
  patchCard(id, {
    status: 'PR_OPEN',
    pr_url: url,
    wait_attempts: '',
    ...totalsFields,
  }, `${isoNow()} REVIEWED->PR_OPEN ${url} (merge e do humano)`)
  if (PROJECT_MEMORY) appendProjectMemory(target, `#${id} "${(desc ?? '').slice(0, 80)}" -> PR aberto (${url})`)
  process.stdout.write(`[runner] #${id}: PR_OPEN ${url}\n`)
}
