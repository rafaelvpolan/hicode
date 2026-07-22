import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { isoNow } from '../card'
import type { Usage, VerifyResult } from '../card'
import { CARD_BUDGET_USD } from './config'
import { readCard, patchCard, repoPath } from './card-store'
import { runGit, stageAll } from './git'
import { freePort, hasBuildScript, previewPort, httpOk, inspectPreview, startPreview, waitHttp } from './preview'
import { implement, runStep } from './agent'
import { appendAttempt, readAttempts } from './attempts'

interface StepOutcome {
  text: string
  fullText: string
  cost: number
  tokens: number
}

function tokensOf(u: Usage | undefined): number {
  return u ? (u.tokens_in || 0) + (u.tokens_out || 0) + (u.tokens_cache_create || 0) : 0
}

function scopedInstruction(instruction: string, file: string, line: string, lineText: string): string {
  if (file && line) {
    const cur = lineText ? ` A linha atual é: \`${lineText}\`.` : ''
    return `Correção pedida pelo revisor humano no arquivo ${file}, linha ${line}.${cur} Aplique exatamente: "${instruction}". Faça a MENOR mudança possível, mexendo só no necessário ao redor dessa linha. Não rode git, não inicie servidores.`
  }
  const target = file ? ` Arquivo alvo: ${file}.` : ''
  return `Correção pedida pelo revisor humano.${target} Faça a MENOR mudança que atenda: "${instruction}". Não mude nada fora do necessário. Não rode git, não inicie servidores.`
}

async function revalidate(id: string, wt: string, target: string): Promise<VerifyResult> {
  if (!hasBuildScript(target)) return { ok: true, reason: 'sem dev server', cost: 0, tokens: 0 }
  const port = previewPort(id)
  const url = `http://localhost:${port}`
  let up = await httpOk(url)
  if (!up) {
    await freePort(port)
    startPreview(wt, port)
    up = await waitHttp(url, 25)
  }
  if (!up) return { ok: true, reason: 'dev server nao respondeu', cost: 0, tokens: 0 }
  const health = await inspectPreview(id, url, true)
  if (!health.conclusive) return { ok: true, reason: `preview no ar — confira pelo link (inspecao automatica indisponivel${health.detail ? ': ' + health.detail : ''})`, cost: 0, tokens: 0 }
  return health.ok
    ? { ok: true, reason: 'preview no ar — confira pelo link', cost: 0, tokens: 0 }
    : { ok: false, reason: `preview com erro: ${health.detail}`, cost: 0, tokens: 0 }
}

async function commit(wt: string, message: string): Promise<void> {
  await stageAll(wt)
  const staged = (await runGit(wt, ['diff', '--cached', '--name-only'])).stdout.trim()
  if (!staged) return
  await runGit(wt, ['-c', 'commit.gpgsign=false', 'commit', '-m', message])
}

function attemptHistory(id: string): string {
  const prior = readAttempts(id)
  if (!prior.length) return ''
  const lines = prior.map(a => `- [${a.kind}] pedido: ${a.reason} | resultado: ${a.response.replace(/\s+/g, ' ').slice(0, 200)}`).join('\n')
  return `Historico de tentativas anteriores neste card (NAO repita os mesmos erros; leve o feedback em conta):\n${lines}\n\n`
}

async function redoPreview(card: NonNullable<ReturnType<typeof readCard>>, wt: string, instruction: string): Promise<StepOutcome> {
  const r = await implement(card, wt, `${attemptHistory(card.fm.id ?? '')}O preview anterior foi REJEITADO pelo revisor. Refaça a tarefa atendendo exatamente: "${instruction}".`, card.fm.surface === 'visual')
  return { text: r.resultText ?? r.reason ?? '', fullText: r.fullText ?? r.resultText ?? r.reason ?? '', cost: parseFloat(r.cost) || 0, tokens: tokensOf(r.usage) }
}

async function scopedFix(wt: string, instruction: string, file: string, line: string, lineText: string, id: string): Promise<StepOutcome> {
  const r = await runStep(wt, 'limpio', scopedInstruction(instruction, file, line, lineText), id)
  return { text: r.text, fullText: r.text, cost: r.cost, tokens: r.tokens }
}

export async function handleCorrect(id: string): Promise<void> {
  const card = readCard(id)
  if (!card) return
  if (CARD_BUDGET_USD > 0 && (parseFloat(card.fm.cost_usd || '0') || 0) > CARD_BUDGET_USD) {
    patchCard(id, { status: 'HALTED', correction: '', correction_file: '', correction_line: '', correction_line_text: '' }, `${isoNow()} CORRECTING->HALTED orcamento excedido (US$${card.fm.cost_usd} > US$${CARD_BUDGET_USD}) antes de refazer — decida se continua`)
    return
  }
  const instruction = card.fm.correction ?? ''
  const file = card.fm.correction_file ?? ''
  const line = card.fm.correction_line ?? ''
  const lineText = card.fm.correction_line_text ?? ''
  const wt = card.fm.worktree ?? ''
  if (!wt || !existsSync(join(wt, '.git'))) {
    patchCard(id, { status: 'HALTED', correction: '', correction_file: '', correction_line: '', correction_line_text: '' }, `${isoNow()} CORRECTING->HALTED correção sem worktree valido`)
    return
  }
  const target = repoPath(card.fm.repo ?? '')
  const redo = !file
  process.stdout.write(`[runner] #${id}: ${redo ? 'refazendo preview (rejeitado)' : 'aplicando correção'} em ${wt}\n`)
  const r = redo ? await redoPreview(card, wt, instruction) : await scopedFix(wt, instruction, file, line, lineText, id)
  appendAttempt(id, redo ? 'reprovacao' : 'correcao', instruction, r.fullText)
  await commit(wt, redo ? `feat: refaz preview apos rejeicao (#${id})` : `fix: correção humana (#${id})`)
  patchCard(id, {
    status: 'PREVIEW',
    correction: '',
    correction_file: '',
    correction_line: '',
    correction_line_text: '',
    verify: 'inconclusivo',
  }, `${isoNow()} CORRECTING->PREVIEW ${redo ? 'preview refeito' : 'correção aplicada'}: ${r.text || 'ok'} (verificando…) (custo $${r.cost.toFixed(4)} · ${r.tokens} tokens)`)
  process.stdout.write(`[runner] #${id}: PREVIEW apos ${redo ? 'refação' : 'correção'} (verificando)\n`)
  const reval = await revalidate(id, wt, target)
  patchCard(id, { verify: reval.ok ? 'ok' : 'falhou' }, `${isoNow()} inspecao pos-${redo ? 'refação' : 'correção'}: ${reval.ok ? 'ok' : 'revisar'} — ${reval.reason}`)
}
