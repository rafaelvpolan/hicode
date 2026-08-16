const IPV4_TEXT = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const IPV6_LOOPBACK_MAPPED = /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/

function ipv4Loopback(host: string): boolean {
  const m = IPV4_TEXT.exec(host)
  if (!m) return false
  const octets = m.slice(1).map(Number)
  if (octets.some(n => n > 255)) return false
  return (octets[0] ?? 0) === 127
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
