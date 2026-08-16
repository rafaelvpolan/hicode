import { lookup } from 'node:dns/promises'
import { isPrivateNetworkHost } from './private-net'
import { clip, refuse } from './url-guard'
import type { Refusal, UrlOk } from './url-guard'

const IPV4_TEXT = /^\d{1,3}(\.\d{1,3}){3}$/

export type HostResolver = (host: string) => Promise<string[]>

export interface AddressPin {
  host: string
  port: string
  addresses: string[]
}

export type AddressCheck = { ok: true; pin: AddressPin | null } | Refusal

export async function lookupReal(host: string): Promise<string[]> {
  const found = await lookup(host, { all: true, verbatim: true })
  return found.map(entry => entry.address)
}

function isIpLiteral(host: string): boolean {
  return host.startsWith('[') || IPV4_TEXT.test(host)
}

export function pinnedResolveArg(pin: AddressPin): string {
  const addresses = pin.addresses.map(a => (a.includes(':') ? `[${a}]` : a)).join(',')
  return `${pin.host}:${pin.port}:${addresses}`
}

export async function approveAddress(target: UrlOk, resolverHost: HostResolver): Promise<AddressCheck> {
  if (isIpLiteral(target.host)) return { ok: true, pin: null }
  let addresses: string[] = []
  try {
    addresses = await resolverHost(target.host)
  } catch {
    return refuse('dns-falhou', `nao foi possivel resolver ${clip(target.host)}`)
  }
  if (!addresses.length) return refuse('dns-falhou', `${clip(target.host)} nao resolveu para endereco nenhum`)
  const internos = addresses.filter(a => isPrivateNetworkHost(a))
  if (internos.length) {
    return refuse('host-bloqueado', `host bloqueado: ${clip(target.host)} resolve para ${clip(internos.join(', '))}`)
  }
  return { ok: true, pin: { host: target.host, port: target.port, addresses } }
}
