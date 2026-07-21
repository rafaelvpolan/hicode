import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { extractObjetivo, isoNow } from '../card'
import type { Card, ImplementResult, StepMap, StepMetric, Usage } from '../card'
import { CARDS_DIR, CLARIFY, VERIFY_MODEL, VISUAL_AI } from './config'
import { clarify, writeClarify } from './clarify'
import { readCard, patchCard, repoPath, repoBase } from './card-store'
import { ensureWorktree, removeWorktree, runGit, stageAll, worktreeOnBranch, worktreePath } from './git'
import { freePort, hasBuildScript, inspectPreview, previewPort, startPreview, waitHttp } from './preview'
import { classifySurface, type SurfaceVerdict } from './classify'
import { implement, verifyVisual } from './agent'
import { writeRun } from './runs'

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
  return classifySurface(card.fm.title ?? '', extractObjetivo(card.body), hasBuildScript(target))
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
    const c = await clarify(card)
    if (c.questions.length) {
      writeClarify(id, c.questions)
      patchCard(id, { status: 'CLARIFY' }, `${isoNow()} EXECUTING->CLARIFY ${c.questions.length} pergunta(s) — aguardando decisao humana`)
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
    } else {
      await ensureWorktree(target, wt, branch, base)
    }
  } catch (e) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} EXECUTING->HALTED ${String((e as Error)?.message ?? e).slice(0, 140)}`)
    return
  }
  process.stdout.write(`[runner] #${id}: implementando em worktree ${wt}\n`)
  const t0 = Date.now()
  const shotPath = join(CARDS_DIR, 'previews', String(id), 'preview.png')
  const steps = initialSteps()
  const tx = Date.now()
  const res = await implement(card, wt, '', surface.surface === 'visual')
  steps.Executando.time += toSeconds(Date.now() - tx)
  steps.Executando.cost += parseFloat(res.cost) || 0
  steps.Executando.tokens += tokensOf(res.usage)
  if (!res.ok) {
    const elapsed = toSeconds(Date.now() - t0)
    const rec = writeRun(id, res, elapsed, asStepMap(steps))
    const reason = res.timedOut
      ? `${res.reason} apos ${elapsed}s (worktree mantido p/ inspecao/retomada)`
      : res.reason
    patchCard(id, { status: 'HALTED', cost_usd: res.cost || '', tokens_total: String(rec.tokens_total) }, `${isoNow()} EXECUTING->HALTED ${reason}`)
    if (!res.timedOut) await removeWorktree(target, wt)
    return
  }
  patchCard(id, {}, `${isoNow()} EXECUTING->EXECUTED ${res.resultText || 'mudanca aplicada'}`)
  if (surface.surface === 'none') {
    const { costSum, tokensTotal } = await commitAndRecord(id, wt, card, steps, res, t0)
    patchCard(id, {
      status: 'PREVIEW_OK',
      verify: 'n/a',
      cost_usd: costSum.toFixed(4),
      tokens_total: String(tokensTotal),
    }, `${isoNow()} EXECUTED->PREVIEW_OK auto — tarefa nao-visual (${surface.reason}); preview pulado`)
    process.stdout.write(`[runner] #${id}: PREVIEW_OK auto (nao-visual) — preview pulado\n`)
    return
  }
  const port = previewPort(id)
  const tpv = Date.now()
  if (hasBuildScript(target)) await freePort(port)
  const pid = hasBuildScript(target) ? startPreview(wt, port) : 0
  const url = pid ? `http://localhost:${port}` : ''
  const up = pid ? await waitHttp(url, 30) : false
  steps.Preview.time = toSeconds(Date.now() - tpv)
  const { costSum, tokensTotal } = await commitAndRecord(id, wt, card, steps, res, t0)
  const initState = !pid ? 'inconclusivo' : (up ? 'inconclusivo' : 'falhou')
  const initReason = !pid
    ? 'repo sem dev server — verificacao humana pelo link'
    : (up ? 'preview no ar — abra o link (verificando…)' : 'dev server nao subiu — preview nao respondeu')
  patchCard(id, {
    status: 'PREVIEW',
    preview_url: url,
    preview_pid: String(pid || ''),
    verify: initState,
    cost_usd: costSum.toFixed(4),
    tokens_total: String(tokensTotal),
  }, `${isoNow()} EXECUTED->PREVIEW ${url || '(sem dev server)'} (${initReason})`)
  process.stdout.write(`[runner] #${id}: PREVIEW ${url} (${initReason})\n`)
  if (up) {
    const health = await inspectPreview(id, url, true)
    let vstate = 'inconclusivo'
    let vreason = `preview no ar — confira pelo link (inspecao automatica indisponivel${health.detail ? ': ' + health.detail : ''})`
    if (VISUAL_AI && health.ok) {
      const v = await verifyVisual(card, shotPath)
      vstate = v.ok ? 'ok' : 'falhou'
      vreason = `check visual (IA, ${VERIFY_MODEL}): ${v.reason}`
    } else if (health.conclusive) {
      vstate = health.ok ? 'ok' : 'falhou'
      vreason = health.ok ? 'preview no ar — abra o link para conferir' : `preview subiu com erro: ${health.detail}`
    }
    patchCard(id, { verify: vstate }, `${isoNow()} inspecao do preview: ${vstate} — ${vreason}`)
    process.stdout.write(`[runner] #${id}: inspecao ${vstate}\n`)
  }
}
