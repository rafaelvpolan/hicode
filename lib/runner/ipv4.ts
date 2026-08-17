const IPV4_TEXT = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

export function ipv4Octets(host: string): number[] | null {
  const m = IPV4_TEXT.exec(host)
  if (!m) return null
  const octets = m.slice(1).map(Number)
  return octets.some(n => n > 255) ? null : octets
}
