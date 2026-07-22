import { existsSync } from 'node:fs'
import { extractObjetivo, isoNow } from '../card'
import { MAX_REAJUSTE } from './config'
import { readCard, patchCard, repoPath, repoBase } from './card-store'
import { ensureWorktree, runGit, stageAll, worktreePath } from './git'
import { runStep } from './agent'
import { openspecAvailable, initOpenspec, validateChange } from '../spec/openspec'
import type { SpecValidation } from '../spec/openspec'

function specPrompt(name: string, desc: string, feedback: string): string {
  return [
    `Crie/ajuste um OpenSpec change chamado "${name}" em openspec/changes/${name}/ para a tarefa abaixo.`,
    'Estrutura: proposal.md (secoes "## Why" e "## What Changes"), tasks.md ("## 1. ..." com itens "- [ ]"), e specs/<capability>/spec.md.',
    'No spec.md: "## ADDED Requirements" -> "### Requirement: <nome>" com uma frase NORMATIVA contendo MUST ou SHALL -> "#### Scenario: <nome>" com linhas "- **WHEN** ..." e "- **THEN** ...".',
    'Cada Requirement PRECISA de ao menos 1 Scenario e da palavra MUST ou SHALL. NAO rode git.',
    feedback ? `\nCORRIJA estes erros de validacao do openspec: ${feedback}` : '',
    '',
    'TAREFA:',
    desc,
  ].join('\n')
}

export async function handleSpec(id: string): Promise<void> {
  const card = readCard(id)
  if (!card) return
  const repoName = card.fm.repo ?? ''
  const slug = card.fm.slug ?? ''
  const target = repoPath(repoName)
  if (!existsSync(target)) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} SPECCED->HALTED repo nao encontrado: ${target}`)
    return
  }
  const base = repoBase(repoName)
  const branch = card.fm.branch || `hicode/${id}-${slug}`
  const wt = card.fm.worktree || worktreePath(target, id, slug)
  patchCard(id, { branch, worktree: wt }, `${isoNow()} SPECCED: preparando worktree para o spec`)
  try {
    await ensureWorktree(target, wt, branch, base)
  } catch (e) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} SPECCED->HALTED ${String((e as Error)?.message ?? e).slice(0, 140)}`)
    return
  }
  if (!(await openspecAvailable())) {
    patchCard(id, { status: 'EXECUTING', spec_done: 'true' }, `${isoNow()} SPECCED->EXECUTING openspec ausente — fase de spec pulada`)
    return
  }
  if (!(await initOpenspec(wt))) patchCard(id, {}, `${isoNow()} spec: openspec init retornou erro (seguindo mesmo assim)`)
  const name = `card-${id}`
  const desc = extractObjetivo(card.body) || card.fm.title || ''
  let v: SpecValidation = { ok: false, failed: 1, issues: ['spec nao gerado'] }
  let attempt = 0
  while (attempt <= MAX_REAJUSTE) {
    await runStep(wt, 'glossia', specPrompt(name, desc, attempt === 0 ? '' : v.issues.slice(0, 5).join('; ')), id)
    v = await validateChange(wt, name)
    patchCard(id, {}, `${isoNow()} spec (glossia) openspec validate: ${v.ok ? 'valido' : `invalido[${v.failed}] ${v.issues.slice(0, 3).join('; ')}`}`)
    if (v.ok) break
    attempt++
  }
  if (!v.ok) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} SPECCED->HALTED spec reprovado no openspec validate --strict apos ${MAX_REAJUSTE} reajuste(s): ${v.issues.slice(0, 3).join('; ')}`)
    return
  }
  await stageAll(wt)
  await runGit(wt, ['-c', 'commit.gpgsign=false', 'commit', '-m', `spec: openspec change ${name} (#${id})`])
  patchCard(id, { status: 'EXECUTING', spec_done: 'true' }, `${isoNow()} SPECCED->EXECUTING (plano aprovado: openspec validate --strict passou; spec commitado)`)
}
