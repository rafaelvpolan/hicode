import { autenticar } from '../../hii/sessao'
const tentativas = new Map<string, { inicio: number; numero: number }>()
export default defineEventHandler(async event => {
  const ip = event.node.req.socket.remoteAddress || 'local'
  const agora = Date.now()
  for (const [k, v] of tentativas) if (agora - v.inicio > 60000) tentativas.delete(k)
  const t = tentativas.get(ip) ?? { inicio: agora, numero: 0 }
  if (++t.numero > 10) throw createError({ statusCode: 429, statusMessage: 'Aguarde um minuto antes de tentar novamente' })
  tentativas.set(ip, t)
  const b = await readBody<{ senha?: string }>(event)
  if (typeof b?.senha !== 'string' || b.senha.length > 512) throw createError({ statusCode: 400, statusMessage: 'Senha invalida' })
  autenticar(event, b.senha)
  return { ok: true }
})
