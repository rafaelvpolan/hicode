import type { CardActionResponse, CardRisk } from '#shared/types'

const VALID_RESUME_STEPS = new Set(['Arquitetura', 'Testes', 'Seguranca', 'Review', 'Limpeza'])

interface CardActionBody {
  reason?: string
  title?: string
  desc?: string
  risk?: CardRisk
  step?: string
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
  else if (action === 'reject') card = transition(id, 'EXECUTED', b?.reason ? `reject: ${b.reason}` : 'preview rejeitado')
  else if (action === 'edit') card = editCard(id, { title: b?.title, desc: b?.desc, risk: b?.risk })
  else if (action === 'replay') {
    const step = b?.step
    if (!step || !VALID_RESUME_STEPS.has(step)) { setResponseStatus(event, 400); return { error: 'step invalido' } }
    card = resumeFrom(id, step)
  } else { setResponseStatus(event, 400); return { error: 'acao invalida' } }
  if (!card) { setResponseStatus(event, 404); return { error: 'card nao encontrado' } }
  return { ok: true, card }
})
