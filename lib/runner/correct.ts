import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { isoNow } from '../card'
import type { VerifyResult } from '../card'
import { CARDS_DIR } from './config'
import { readCard, patchCard, repoPath } from './card-store'
import { runGit } from './git'
import { hasBuildScript, previewPort, httpOk, screenshot, startPreview, waitHttp } from './preview'
import { runStep, verifyVisual } from './claude'

function buildInstruction(instruction: string, file: string): string {
  const target = file ? ` Arquivo alvo: ${file}.` : ''
  return `Correção pedida pelo revisor humano.${target} Faça a MENOR mudança que atenda: "${instruction}". Não mude nada fora do necessário. Não rode git, não inicie servidores.`
}

async function revalidate(id: string, card: NonNullable<ReturnType<typeof readCard>>, wt: string, target: string): Promise<VerifyResult> {
  if (!hasBuildScript(target)) return { ok: true, reason: 'sem dev server', cost: 0, tokens: 0 }
  const port = previewPort(id)
  const url = `http://localhost:${port}`
  let up = await httpOk(url)
  if (!up) {
    startPreview(wt, port)
    up = await waitHttp(url, 25)
  }
  if (!up) return { ok: true, reason: 'dev server nao respondeu', cost: 0, tokens: 0 }
  await new Promise(resolve => setTimeout(resolve, 2500))
  const shotPath = join(CARDS_DIR, 'previews', String(id), 'preview.png')
  await screenshot(id, url)
  return verifyVisual(card, shotPath)
}

async function commitCorrection(wt: string, id: string): Promise<void> {
  await runGit(wt, ['add', '-A'])
  const staged = (await runGit(wt, ['diff', '--cached', '--name-only'])).stdout.trim()
  if (!staged) return
  await runGit(wt, ['-c', 'commit.gpgsign=false', 'commit', '-m', `fix: correção humana (#${id})`])
}

export async function handleCorrect(id: string): Promise<void> {
  const card = readCard(id)
  if (!card) return
  const instruction = card.fm.correction ?? ''
  const file = card.fm.correction_file ?? ''
  const wt = card.fm.worktree ?? ''
  if (!wt || !existsSync(join(wt, '.git'))) {
    patchCard(id, { status: 'HALTED', correction: '', correction_file: '' }, `${isoNow()} CORRECTING->HALTED correção sem worktree valido`)
    return
  }
  const target = repoPath(card.fm.repo ?? '')
  process.stdout.write(`[runner] #${id}: aplicando correção humana em ${wt}\n`)
  const r = await runStep(wt, 'limpio', buildInstruction(instruction, file))
  const reval = await revalidate(id, card, wt, target)
  await commitCorrection(wt, id)
  patchCard(id, {
    status: 'PREVIEW',
    correction: '',
    correction_file: '',
    verify: reval.ok ? 'ok' : 'falhou',
  }, `${isoNow()} CORRECTING->PREVIEW correção aplicada (limpio): ${r.text || 'ok'} — visual ${reval.ok ? 'OK' : 'revisar'} (custo $${r.cost.toFixed(4)} · ${r.tokens} tokens)`)
  process.stdout.write(`[runner] #${id}: PREVIEW apos correção (visual ${reval.ok ? 'OK' : 'revisar'})\n`)
}
