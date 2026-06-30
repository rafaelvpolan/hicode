export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '').padStart(3, '0')
  const action = getRouterParam(event, 'action')
  const b = await readBody(event).catch(() => ({}))
  let card = null
  if (action === 'start') card = transition(id, 'EXECUTING', 'iniciado pelo painel')
  else if (action === 'pause') card = transition(id, 'PAUSED', 'pausado pelo painel')
  else if (action === 'resume') card = transition(id, 'EXECUTING', 'retomado pelo painel')
  else if (action === 'approve') card = transition(id, 'PREVIEW_OK', 'preview aprovado')
  else if (action === 'reject') card = transition(id, 'EXECUTED', b?.reason ? `reject: ${b.reason}` : 'preview rejeitado')
  else if (action === 'edit') card = editCard(id, { title: b?.title, desc: b?.desc, risk: b?.risk })
  else { setResponseStatus(event, 400); return { error: 'acao invalida' } }
  if (!card) { setResponseStatus(event, 404); return { error: 'card nao encontrado' } }
  return { ok: true, card }
})
