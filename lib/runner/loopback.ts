import { ipv4Octets } from './ipv4'

const IPV6_LOOPBACK_MAPPED = /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/

function ipv4Loopback(host: string): boolean {
  const octets = ipv4Octets(host)
  return octets !== null && (octets[0] ?? 0) === 127
}

export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '').replace(/\.+$/, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '::1' || h === '::' || h === '0.0.0.0') return true
  if (ipv4Loopback(h)) return true
  return IPV6_LOOPBACK_MAPPED.test(h)
}

export function isLoopbackUrl(url: string): boolean {
  try {
    return isLoopbackHost(new URL(url).hostname)
  } catch {
    return false
  }
}

export function noProxyArgs(url: string): string[] {
  return isLoopbackUrl(url) ? ['--noproxy', '*'] : []
}
