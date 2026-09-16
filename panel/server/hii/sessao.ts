import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, getCookie, setCookie } from 'h3'

const cookie = 'hicode_hii_session'
function segredo(): string {
  const s = process.env.HICODE_SESSION_SECRET || ''
  if (s.length < 32) throw createError({ statusCode: 503, statusMessage: 'Configure HICODE_SESSION_SECRET (32+ caracteres)' })
  return s
}
function assinatura(s: string): string { return createHmac('sha256', segredo()).update(s).digest('hex') }
function igual(a: string, b: string): boolean { return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest()) }
export function autenticar(event: H3Event, senha: string): void {
  const esperada = process.env.HICODE_PANEL_PASSWORD || ''
  if (esperada.length < 12) throw createError({ statusCode: 503, statusMessage: 'Configure HICODE_PANEL_PASSWORD (12+ caracteres)' })
  if (!igual(senha, esperada)) throw createError({ statusCode: 401, statusMessage: 'Credencial invalida' })
  const expira = String(Date.now() + 8 * 3600000)
  setCookie(event, cookie, `${expira}.${assinatura(expira)}`, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api/hii', maxAge: 8 * 3600 })
}
export function exigirSessao(event: H3Event): void {
  const valor = getCookie(event, cookie) || ''
  const [expira = '', sig = ''] = valor.split('.')
  if (!/^\d{13}$/.test(expira) || Number(expira) <= Date.now() || !igual(sig, assinatura(expira))) throw createError({ statusCode: 401, statusMessage: 'Entre para acessar o motor' })
}
