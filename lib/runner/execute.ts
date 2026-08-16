import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { extractObjetivo, isoNow } from '../card'
import type { Card, Fields, ImplementResult, StepMap, StepMetric, Usage } from '../card'
import { CARD_BUDGET_USD, cardsDir, CLARIFY, EVAL, quotaFallbackLigado, VERIFY_MODEL, VISUAL_AI } from './config'
import { clarify, clarifyPorIdeacao, writeClarify } from './clarify'
import { planSteps } from './analyze'
import { activeSteps } from './pipeline/config'
import { evaluate } from './eval'
import { readCard, patchCard, repoPath, repoBase } from './card-store'
import { ensureWorktree, refreshFromBase, runGit, settleWorktree, stageAll, worktreeOnBranch, worktreePath } from './git'
import type { WorktreeFate } from './git'
import { ensurePreview, hasDevServer, inspectPreview, previewPort, stopPreview, waitHttp } from './preview'
import { classifySurface, type SurfaceVerdict } from './classify'
import { implement, verifyVisual } from './agent'
import { writeRun } from './runs'
import { warnBudgetWithoutGuarantee } from './cost-trust'
import { applyFailurePolicy } from './failure-policy'
import { quotaFallbackProviderFor } from '../ai/registry'

interface ExecuteSteps {
  Fila: StepMetric
  Executando: StepMetric
  Feito: StepMetric
  Preview: StepMetric
  Aprovado: StepMetric
  Arquitetura: StepMetric
  Testes: StepMetric
  Seguranca: StepMetric
  Review: StepMetric
  Limpeza: StepMetric
  Reajuste: StepMetric
  Revalidacao: StepMetric
}

function zeroMetric(): StepMetric {
  return { time: 0, cost: 0, tokens: 0 }
}

function toSeconds(ms: number): number {
  return Math.round(ms / 1000)
}

function tokensOf(u: Usage | undefined): number {
  return u ? (u.tokens_in || 0) + (u.tokens_out || 0) + (u.tokens_cache_create || 0) : 0
}

function initialSteps(): ExecuteSteps {
  return {
    Fila: zeroMetric(),
    Executando: zeroMetric(),
    Feito: zeroMetric(),
    Preview: zeroMetric(),
    Aprovado: zeroMetric(),
    Arquitetura: zeroMetric(),
    Testes: zeroMetric(),
    Seguranca: zeroMetric(),
    Review: zeroMetric(),
    Limpeza: zeroMetric(),
    Reajuste: zeroMetric(),
    Revalidacao: zeroMetric(),
  }
}

function asStepMap(steps: ExecuteSteps): StepMap {
  return { ...steps }
}

function resolveSurface(card: Card, target: string): SurfaceVerdict {
  const explicit = card.fm.surface
  if (explicit === 'visual' || explicit === 'none') return { surface: explicit, reason: 'definido no card' }
  return classifySurface(card.fm.title ?? '', extractObjetivo(card.body), hasDevServer(target))
}

async function commitAndRecord(id: string, wt: string, card: Card, steps: ExecuteSteps, res: ImplementResult, t0: number): Promise<{ costSum: number; tokensTotal: number }> {
  const tf = Date.now()
  await stageAll(wt)
  await runGit(wt, ['-c', 'commit.gpgsign=false', 'commit', '-m', `feat: ${card.fm.title ?? ''} (#${id})`])
  steps.Feito.time = toSeconds(Date.now() - tf)
  const costSum = steps.Executando.cost + steps.Preview.cost
  const rec = writeRun(id, { ...res, cost: costSum.toFixed(4) }, toSeconds(Date.now() - t0), asStepMap(steps))
  return { costSum, tokensTotal: rec.tokens_total }
}

export async function handleExecute(id: string): Promise<void> {
  const card = readCard(id)
  if (!card) return
  const baseCost = parseFloat(card.fm.cost_usd || '0') || 0
  const baseTokens = Number(card.fm.tokens_total || '0') || 0
  if (CARD_BUDGET_USD > 0 && baseCost > CARD_BUDGET_USD) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} EXECUTING->HALTED orcamento excedido (US$${card.fm.cost_usd} > US$${CARD_BUDGET_USD}) antes de (re)executar — decida se continua`)
    return
  }
  warnBudgetWithoutGuarantee(id, card.fm, CARD_BUDGET_USD)
  let auxCost = 0
  let auxTokens = 0
  const repoName = card.fm.repo ?? ''
  const slug = card.fm.slug ?? ''
  const target = repoPath(repoName)
  if (!existsSync(target)) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} EXECUTING->HALTED repo nao encontrado: ${target}`)
    return
  }
  const surface = resolveSurface(card, target)
  if (card.fm.surface !== surface.surface) {
    patchCard(id, { surface: surface.surface }, `${isoNow()} classificacao previa: tarefa ${surface.surface === 'visual' ? 'VISUAL' : 'NAO-VISUAL'} (${surface.reason})`)
  }
  if (CLARIFY && card.fm.clarified !== 'true') {
    const perfilPrevio = planSteps(
      { title: card.fm.title, objetivo: extractObjetivo(card.body), risk: card.fm.risk, surface: surface.surface, override: card.fm.steps },
      activeSteps(),
    ).profile
    const ide = await clarifyPorIdeacao(card, perfilPrevio)
    auxCost += ide.cost
    auxTokens += ide.tokens
    if (ide.perguntas.length) {
      writeClarify(id, ide.perguntas)
      patchCard(id, { status: 'CLARIFY', cost_usd: (baseCost + auxCost).toFixed(4), tokens_total: String(baseTokens + auxTokens) }, `${isoNow()} EXECUTING->CLARIFY ideacao divergente (${ide.motivo}) — escolha a abordagem`)
      process.stdout.write(`[runner] #${id}: CLARIFY por ideacao (${ide.motivo})\n`)
      return
    }
    if (ide.motivo) patchCard(id, {}, `${isoNow()} ideacao: pulada — ${ide.motivo}`)
    const c = await clarify(card)
    auxCost += c.cost || 0
    auxTokens += c.tokens || 0
    if (c.questions.length) {
      writeClarify(id, c.questions)
      patchCard(id, { status: 'CLARIFY', cost_usd: (baseCost + auxCost).toFixed(4), tokens_total: String(baseTokens + auxTokens) }, `${isoNow()} EXECUTING->CLARIFY ${c.questions.length} pergunta(s) — aguardando decisao humana`)
      process.stdout.write(`[runner] #${id}: CLARIFY (${c.questions.length} pergunta(s))\n`)
      return
    }
    patchCard(id, { clarified: 'true' }, `${isoNow()} clarify: tarefa clara — seguindo sem perguntas`)
  }
  if (card.fm.spec === 'required' && card.fm.spec_done !== 'true') {
    patchCard(id, { status: 'SPECCED' }, `${isoNow()} EXECUTING->SPECCED roteado para a fase de spec (spec: required)`)
    return
  }
  const base = repoBase(repoName)
  const branch = card.fm.branch || `hicode/${id}-${slug}`
  const wt = card.fm.worktree || worktreePath(target, id, slug)
  patchCard(id, { branch, worktree: wt }, `${isoNow()} EXECUTING: preparando worktree ${branch}`)
  try {
    const reuse = card.fm.spec_done === 'true' && await worktreeOnBranch(wt, branch)
    if (card.fm.spec_done === 'true' && !reuse) {
      patchCard(id, { status: 'SPECCED', spec_done: '' }, `${isoNow()} EXECUTING->SPECCED worktree do spec ausente — regerando spec`)
      return
    }
    if (reuse) {
      await runGit(wt, ['reset', '--hard', 'HEAD'])
      await runGit(wt, ['clean', '-fd', '-e', 'node_modules'])
      const up = await refreshFromBase(wt, base)
      if (!up.ok) {
        patchCard(id, { status: 'HALTED' }, `${isoNow()} EXECUTING->HALTED nao consegui partir de ${base} atualizado: ${up.detail}`)
        return
      }
      patchCard(id, {}, `${isoNow()} base: ${up.detail} (worktree do spec reaproveitado)`)
    } else {
      const info = await ensureWorktree(target, wt, branch, base)
      patchCard(id, { base_commit: info.baseCommit }, `${isoNow()} base: branch criada de origin/${base}@${info.baseCommit}`)
    }
  } catch (e) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} EXECUTING->HALTED ${String((e as Error)?.message ?? e).slice(0, 140)}`)
    return
  }
  process.stdout.write(`[runner] #${id}: implementando em worktree ${wt}\n`)
  const port = previewPort(id)
  let previewPid = 0
  if (surface.surface === 'visual' && hasDevServer(target)) {
    const h = await ensurePreview(wt, port, target, card.fm.preview_pid)
    previewPid = h.pid
    patchCard(id, { preview_url: `http://localhost:${port}`, preview_pid: String(previewPid) }, `${isoNow()} preview ${h.reused ? 'reaproveitado (ja estava no ar)' : 'subindo'} em http://localhost:${port} — acompanhe pelo link enquanto a IA trabalha`)
    process.stdout.write(`[runner] #${id}: preview ${h.reused ? 'reaproveitado' : 'ao vivo'} em http://localhost:${port}\n`)
  }
  const t0 = Date.now()
  const shotPath = join(cardsDir(), 'previews', String(id), 'preview.png')
  const steps = initialSteps()
  const tx = Date.now()
  const res = await implement(card, wt, '', surface.surface === 'visual')
  steps.Executando.time += toSeconds(Date.now() - tx)
  steps.Executando.cost += parseFloat(res.cost) || 0
  steps.Executando.tokens += tokensOf(res.usage)
  if (!res.ok) {
    const elapsed = toSeconds(Date.now() - t0)
    const rec = writeRun(id, res, elapsed, asStepMap(steps))
    const totalCost = baseCost + auxCost + (parseFloat(res.cost || '0') || 0)
    const totalTokens = baseTokens + auxTokens + rec.tokens_total
    const totals: Fields = { cost_usd: totalCost.toFixed(4), tokens_total: String(totalTokens) }
    const failureClass = res.failureClass ?? 'terminal'
    const failureReason = res.failureReason ?? 'falha nao classificada'
    if (failureClass === 'quota' && quotaFallbackLigado()) {
      const fallback = quotaFallbackProviderFor('implement')
      if (fallback && fallback !== res.provider) {
        patchCard(id, { provider_override_implement: fallback, ...totals }, `${isoNow()} EXECUTING: cota de ${res.provider ?? 'provedor'} esgotada — trocando para ${fallback} (config explicita HICODE_QUOTA_FALLBACK=on) e tentando de novo`)
        return
      }
    }
    const technicalDetail = res.timedOut ? `${res.reason ?? ''} apos ${elapsed}s` : (res.reason ?? '')
    const outcome = applyFailurePolicy({
      id,
      fromStatus: 'EXECUTING',
      resumeStatus: 'EXECUTING',
      provider: res.provider ?? '',
      failureClass,
      failureReason,
      technicalDetail,
      extraFields: totals,
    })
    if (outcome === 'waiting') return
    const fate: WorktreeFate = failureClass === 'transient' ? 'keep-for-inspection' : 'discard'
    if (fate === 'discard' && previewPid) stopPreview(String(previewPid))
    await settleWorktree(target, wt, fate)
    return
  }
  patchCard(id, { wait_attempts: '' }, `${isoNow()} EXECUTING->EXECUTED ${res.resultText || 'mudanca aplicada'}`)
  if (surface.surface === 'none') {
    const { costSum, tokensTotal } = await commitAndRecord(id, wt, card, steps, res, t0)
    patchCard(id, {
      status: 'PREVIEW_OK',
      verify: 'n/a',
      cost_usd: (baseCost + costSum + auxCost).toFixed(4),
      tokens_total: String(baseTokens + tokensTotal + auxTokens),
    }, `${isoNow()} EXECUTED->PREVIEW_OK auto — tarefa nao-visual (${surface.reason}); preview pulado`)
    process.stdout.write(`[runner] #${id}: PREVIEW_OK auto (nao-visual) — preview pulado\n`)
    return
  }
  const tpv = Date.now()
  const pid = previewPid || (hasDevServer(target) ? (await ensurePreview(wt, port, target, card.fm.preview_pid)).pid : 0)
  const url = pid ? `http://localhost:${port}` : ''
  const up = pid ? await waitHttp(url, 30) : false
  steps.Preview.time = toSeconds(Date.now() - tpv)
  const { costSum, tokensTotal } = await commitAndRecord(id, wt, card, steps, res, t0)
  const auxAtPreview = auxCost
  const initState = !pid ? 'inconclusivo' : (up ? 'inconclusivo' : 'falhou')
  const initReason = !pid
    ? 'repo sem dev server — verificacao humana pelo link'
    : (up ? 'preview no ar — abra o link (verificando…)' : 'dev server nao subiu — preview nao respondeu')
  patchCard(id, {
    status: 'PREVIEW',
    preview_url: url,
    preview_pid: String(pid || ''),
    verify: initState,
    cost_usd: (baseCost + costSum + auxCost).toFixed(4),
    tokens_total: String(baseTokens + tokensTotal + auxTokens),
  }, `${isoNow()} EXECUTED->PREVIEW ${url || '(sem dev server)'} (${initReason})`)
  process.stdout.write(`[runner] #${id}: PREVIEW ${url} (${initReason})\n`)
  if (up) {
    const health = await inspectPreview(id, url, true)
    let vstate = 'inconclusivo'
    let vreason = `preview no ar — confira pelo link (inspecao automatica indisponivel${health.detail ? ': ' + health.detail : ''})`
    if (VISUAL_AI && health.ok) {
      const v = await verifyVisual(card, shotPath)
      auxCost += v.cost || 0
      auxTokens += v.tokens || 0
      vstate = v.ok ? 'ok' : 'falhou'
      vreason = `check visual (IA, ${VERIFY_MODEL}): ${v.reason}`
    } else if (health.conclusive) {
      vstate = health.ok ? 'ok' : 'falhou'
      vreason = health.ok ? 'preview no ar — abra o link para conferir' : `preview subiu com erro: ${health.detail}`
    }
    patchCard(id, { verify: vstate }, `${isoNow()} inspecao do preview: ${vstate} — ${vreason}`)
    process.stdout.write(`[runner] #${id}: inspecao ${vstate}\n`)
  }
  if (EVAL) {
    const e = await evaluate(card, wt, base)
    auxCost += e.cost || 0
    auxTokens += e.tokens || 0
    patchCard(id, { eval_score: String(e.score), eval_notes: e.notes }, `${isoNow()} eval (qualidade vs objetivo): ${e.score}/5 ${e.meets ? '(cumpre)' : '(revisar)'} — ${e.notes}`)
    process.stdout.write(`[runner] #${id}: eval ${e.score}/5\n`)
  }
  if (auxCost !== auxAtPreview) {
    const total = baseCost + costSum + auxCost
    patchCard(id, { cost_usd: total.toFixed(4), tokens_total: String(baseTokens + tokensTotal + auxTokens) }, `${isoNow()} custo atualizado (verificacao/eval): $${total.toFixed(4)}`)
  }
}
