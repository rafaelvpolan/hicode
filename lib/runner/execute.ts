import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { isoNow } from '../card'
import type { StepMap, StepMetric, Usage, VerifyResult } from '../card'
import { CARDS_DIR, MAX_VERIFY, VERIFY_MODEL, VISUAL_AI } from './config'
import { readCard, patchCard, repoPath, repoBase } from './card-store'
import { ensureWorktree, removeWorktree, runGit, stageAll, worktreeOnBranch, worktreePath } from './git'
import { hasBuildScript, previewPort, screenshot, startPreview, waitHttp } from './preview'
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
  let tx = Date.now()
  let res = await implement(card, wt, '')
  steps.Executando.time += toSeconds(Date.now() - tx)
  steps.Executando.cost += parseFloat(res.cost) || 0
  steps.Executando.tokens += tokensOf(res.usage)
  if (!res.ok) {
    const rec = writeRun(id, res, toSeconds(Date.now() - t0), asStepMap(steps))
    patchCard(id, { status: 'HALTED', cost_usd: res.cost || '', tokens_total: String(rec.tokens_total) }, `${isoNow()} EXECUTING->HALTED ${res.reason}`)
    await removeWorktree(target, wt)
    return
  }
  patchCard(id, {}, `${isoNow()} EXECUTING->EXECUTED ${res.resultText || 'mudanca aplicada'}`)
  const port = previewPort(id)
  const pid = hasBuildScript(target) ? startPreview(wt, port) : 0
  const url = pid ? `http://localhost:${port}` : ''
  const up = pid ? await waitHttp(url, 30) : false
  const tp = Date.now()
  let verify: VerifyResult = pid
    ? { ok: false, conclusive: true, reason: 'dev server nao subiu — preview nao renderizou', cost: 0, tokens: 0 }
    : { ok: true, conclusive: false, reason: 'sem dev server (check visual pulado)', cost: 0, tokens: 0 }
  let attempt = 0
  while (up) {
    await new Promise(r => setTimeout(r, 2500))
    const shot = await screenshot(id, url)
    if (!shot) {
      verify = { ok: false, conclusive: true, reason: 'falha ao capturar screenshot (playwright ausente ou pagina em erro)', cost: 0, tokens: 0 }
      break
    }
    if (!VISUAL_AI) {
      verify = { ok: true, conclusive: false, reason: 'preview renderizado (check de IA desligado) — verificacao humana', cost: 0, tokens: 0 }
      break
    }
    verify = await verifyVisual(card, shotPath)
    steps.Preview.cost += verify.cost || 0
    steps.Preview.tokens += verify.tokens || 0
    patchCard(id, {}, `${isoNow()} check visual (IA, ${VERIFY_MODEL}): ${verify.ok ? 'OK' : 'FALHOU'} — ${verify.reason}`)
    if (verify.ok || attempt >= MAX_VERIFY) break
    attempt++
    process.stdout.write(`[runner] #${id}: check visual falhou, reexecutando (${attempt})\n`)
    const tx2 = Date.now()
    const r2 = await implement(card, wt, `A verificacao visual falhou: ${verify.reason}. Garanta que o elemento/mudanca pedido apareca DE FATO e visivelmente na pagina.`)
    steps.Executando.time += toSeconds(Date.now() - tx2)
    steps.Executando.cost += parseFloat(r2.cost) || 0
    steps.Executando.tokens += tokensOf(r2.usage)
    if (r2.ok) res = r2
  }
  steps.Preview.time = toSeconds(Date.now() - tp)
  const tf = Date.now()
  await stageAll(wt)
  await runGit(wt, ['-c', 'commit.gpgsign=false', 'commit', '-m', `feat: ${card.fm.title ?? ''} (#${id})`])
  steps.Feito.time = toSeconds(Date.now() - tf)
  const costSum = steps.Executando.cost + steps.Preview.cost
  const duration = toSeconds(Date.now() - t0)
  const rec = writeRun(id, { ...res, cost: costSum.toFixed(4) }, duration, asStepMap(steps))
  const vstate = verify.ok ? 'ok' : (verify.conclusive === false ? 'inconclusivo' : 'falhou')
  const vlabel = verify.ok ? 'visual OK' : (verify.conclusive === false ? 'visual inconclusivo (verificacao humana)' : 'visual NAO confirmado')
  patchCard(id, {
    status: 'PREVIEW',
    preview_url: url,
    preview_pid: String(pid || ''),
    verify: vstate,
    cost_usd: costSum.toFixed(4),
    tokens_total: String(rec.tokens_total),
  }, `${isoNow()} EXECUTED->PREVIEW ${url || '(sem dev server)'} (${vlabel}: ${verify.reason})`)
  process.stdout.write(`[runner] #${id}: PREVIEW ${url} (${vlabel})\n`)
}
