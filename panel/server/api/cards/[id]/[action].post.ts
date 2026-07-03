import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CardActionResponse, CardRisk } from '#shared/types'

const VALID_RESUME_STEPS = new Set(['Arquitetura', 'Testes', 'Seguranca', 'Review', 'Limpeza'])

interface CardActionBody {
  reason?: string
  title?: string
  desc?: string
  risk?: CardRisk
  step?: string
  file?: string
  instruction?: string
}

export default defineEventHandler(async (event): Promise<CardActionResponse> => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const action = getRouterParam(event, 'action')
  const b = await readBody<CardActionBody>(event).catch(() => ({}) as CardActionBody)
  let card = null
  if (action === 'start') card = transition(id, 'EXECUTING', 'iniciado pelo painel')
  else if (action === 'pause') card = transition(id, 'PAUSED', 'pausado pelo painel')
  else if (action === 'resume') card = transition(id, 'EXECUTING', 'retomado pelo painel')
  else if (action === 'approve') card = transition(id, 'PREVIEW_OK', 'preview aprovado')
  else if (action === 'reject') {
    const reason = (b?.reason || '').trim()
    const cur = readCards().find(c => c.id === id)
    if (reason && cur && cur.status === 'PREVIEW' && cur.worktree && existsSync(join(cur.worktree, '.git'))) {
      card = requestCorrection(id, '', reason)
    } else {
      card = transition(id, 'EXECUTED', reason ? `reject: ${reason}` : 'preview rejeitado')
    }
  }
  else if (action === 'edit') card = editCard(id, { title: b?.title, desc: b?.desc, risk: b?.risk })
  else if (action === 'replay') {
    const step = b?.step
    if (!step || !VALID_RESUME_STEPS.has(step)) { setResponseStatus(event, 400); return { error: 'step invalido' } }
    card = resumeFrom(id, step)
  } else if (action === 'correct') {
    const instruction = (b?.instruction || '').trim()
    if (!instruction) { setResponseStatus(event, 400); return { error: 'instrução vazia' } }
    const cur = readCards().find(c => c.id === id)
    if (!cur) { setResponseStatus(event, 404); return { error: 'card nao encontrado' } }
    if (cur.status !== 'PREVIEW' || !cur.worktree || !existsSync(join(cur.worktree, '.git'))) {
      setResponseStatus(event, 409)
      return { error: 'correção só no preview com worktree ativo — aprove/rejeite este card ou use /codefox no PR' }
    }
    card = requestCorrection(id, (b?.file || '').trim(), instruction)
  } else { setResponseStatus(event, 400); return { error: 'acao invalida' } }
  if (!card) { setResponseStatus(event, 404); return { error: 'card nao encontrado' } }
  return { ok: true, card }
})
