import { isPrivateNetworkHost } from './private-net'

export type RefusalReason =
  | 'url-invalida'
  | 'esquema-invalido'
  | 'host-bloqueado'
  | 'dns-falhou'
  | 'saltos-demais'
  | 'transporte-falhou'
  | 'resposta-de-erro'
  | 'resposta-vazia'
  | 'arquivo-grande-demais'
  | 'fonte-invalida'

export interface Refusal {
  ok: false
  reason: RefusalReason
  detail: string
}

export interface UrlOk {
  ok: true
  url: string
  host: string
  port: string
}

export type UrlCheck = UrlOk | Refusal

export function refuse(reason: RefusalReason, detail: string): Refusal {
  return { ok: false, reason, detail }
}

export function clip(s: string): string {
  return String(s).replace(/[\r\n\t]+/g, ' ').slice(0, 160)
}

export function isBlockedHost(host: string): boolean {
  return isPrivateNetworkHost(host)
}

function portaEfetiva(u: URL): string {
  if (u.port) return u.port
  return u.protocol === 'https:' ? '443' : '80'
}

export function validateHttpUrl(s: string): UrlCheck {
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return refuse('url-invalida', `URL invalida: ${clip(s)}`)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return refuse('esquema-invalido', `esquema ${u.protocol} nao permitido: ${clip(s)}`)
  }
  if (isBlockedHost(u.hostname)) {
    return refuse('host-bloqueado', `host bloqueado: ${u.hostname} (${clip(s)})`)
  }
  return { ok: true, url: u.toString(), host: u.hostname, port: portaEfetiva(u) }
}
