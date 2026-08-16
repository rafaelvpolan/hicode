import { clip, refuse, validateHttpUrl } from './url-guard'
import type { Refusal, UrlCheck, UrlOk } from './url-guard'
import { approveAddress, lookupReal } from './host-resolve'
import type { AddressPin, HostResolver } from './host-resolve'

export const MAX_REDIRECTS = 3

export interface HopResponse {
  status: number
  location: string
  failed: boolean
  refusal?: Refusal
}

export type HopFetcher = (url: string, pin: AddressPin | null) => Promise<HopResponse>

export interface FinalHop {
  ok: true
  url: string
  status: number
  redirects: number
}

export type FollowResult = FinalHop | Refusal

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400 && status !== 304
}

function resolveHopTarget(location: string, current: string): UrlCheck {
  let absolute: string
  try {
    absolute = new URL(location, current).toString()
  } catch {
    return refuse('url-invalida', `Location invalido "${clip(location)}" em ${clip(current)}`)
  }
  return validateHttpUrl(absolute)
}

export async function followRedirects(
  start: string,
  fetchHop: HopFetcher,
  maxRedirects = MAX_REDIRECTS,
  resolverHost: HostResolver = lookupReal,
): Promise<FollowResult> {
  const first = validateHttpUrl(start)
  if (!first.ok) return first
  let current: UrlOk = first
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const approved = await approveAddress(current, resolverHost)
    if (!approved.ok) return approved
    const hop = await fetchHop(current.url, approved.pin)
    if (hop.failed) return hop.refusal ?? refuse('transporte-falhou', `falha ao buscar ${clip(current.url)}`)
    const location = hop.location.trim()
    if (!isRedirectStatus(hop.status) || !location) {
      return { ok: true, url: current.url, status: hop.status, redirects }
    }
    const next = resolveHopTarget(location, current.url)
    if (!next.ok) return next
    current = next
  }
  return refuse('saltos-demais', `cadeia de redirect passou do teto de ${maxRedirects} saltos a partir de ${clip(start)}`)
}
