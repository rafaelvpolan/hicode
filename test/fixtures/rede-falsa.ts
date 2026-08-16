import { followRedirects, MAX_REDIRECTS } from '../../lib/runner/redirect'
import type { FinalHop, FollowResult, HopFetcher, HopResponse } from '../../lib/runner/redirect'
import type { AddressPin, HostResolver } from '../../lib/runner/host-resolve'
import type { Refusal } from '../../lib/runner/url-guard'

export const PUBLICO = '93.184.216.34'
export const PUBLICO_V6 = '2606:2800:220:1:248:1893:25c8:1946'
export const METADADOS_IP = '169.254.169.254'

export const LOGO = 'https://cdn.exemplo.com/a/logo.png'
export const METADADOS = 'http://169.254.169.254/latest/meta-data/iam/security-credentials/'
export const METADADOS_GCP_PONTO = 'http://metadata.google.internal./computeMetadata/v1/instance/service-accounts/default/token'

export interface FakeNet {
  fetchHop: HopFetcher
  visitados: string[]
  fixados: (AddressPin | null)[]
}

export function net(chain: Record<string, HopResponse>): FakeNet {
  const visitados: string[] = []
  const fixados: (AddressPin | null)[] = []
  return {
    visitados,
    fixados,
    fetchHop: async (url: string, pin: AddressPin | null): Promise<HopResponse> => {
      visitados.push(url)
      fixados.push(pin)
      return chain[url] ?? { status: 200, location: '', failed: false }
    },
  }
}

export function movedTo(location: string): HopResponse {
  return { status: 302, location, failed: false }
}

export function recusa(r: FollowResult): Refusal {
  if (r.ok) throw new Error(`esperava recusa, veio sucesso em ${r.url}`)
  return r
}

export function destino(r: FollowResult): FinalHop {
  if (!r.ok) throw new Error(`esperava sucesso, veio recusa ${r.reason}: ${r.detail}`)
  return r
}

export function dnsFalso(mapa: Record<string, string[]>): HostResolver {
  return async (host: string): Promise<string[]> => mapa[host] ?? [PUBLICO]
}

export const DNS = dnsFalso({
  'malvado.exemplo': [METADADOS_IP],
  'espelho.exemplo': ['127.0.0.1'],
  'espelho6.exemplo': ['::1'],
  'duplo.exemplo': [PUBLICO, '::1'],
})

export function segue(start: string, n: FakeNet, resolver: HostResolver = DNS): Promise<FollowResult> {
  return followRedirects(start, n.fetchHop, MAX_REDIRECTS, resolver)
}
