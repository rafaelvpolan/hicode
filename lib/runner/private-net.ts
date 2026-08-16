const IPV4_TEXT = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const HEXTET = /^[0-9a-f]{1,4}$/
const GROUPS = 8
const MAPPED_MARKER = 0xffff

function ipv4AsHextets(part: string): number[] | null {
  const m = IPV4_TEXT.exec(part)
  if (!m) return null
  const octets = m.slice(1).map(Number)
  if (octets.some(n => n > 255)) return null
  return [((octets[0] ?? 0) << 8) | (octets[1] ?? 0), ((octets[2] ?? 0) << 8) | (octets[3] ?? 0)]
}

function hextetsOf(half: string): number[] | null {
  if (!half) return []
  const pieces = half.split(':')
  const out: number[] = []
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i] ?? ''
    const embedded = ipv4AsHextets(piece)
    if (embedded) {
      if (i !== pieces.length - 1) return null
      out.push(...embedded)
      continue
    }
    if (!HEXTET.test(piece)) return null
    out.push(parseInt(piece, 16))
  }
  return out
}

function ipv6Groups(host: string): number[] | null {
  if (!host.includes(':')) return null
  const halves = host.split('::')
  if (halves.length > 2) return null
  const head = hextetsOf(halves[0] ?? '')
  const tail = halves.length === 2 ? hextetsOf(halves[1] ?? '') : []
  if (!head || !tail) return null
  if (halves.length === 1) return head.length === GROUPS ? head : null
  const zeros = GROUPS - head.length - tail.length
  if (zeros < 1) return null
  return [...head, ...new Array<number>(zeros).fill(0), ...tail]
}

function ipv4EmbeddedInIpv6(groups: number[]): string {
  const marker = groups[5] ?? 0
  if (!groups.slice(0, 5).every(g => g === 0)) return ''
  if (marker !== 0 && marker !== MAPPED_MARKER) return ''
  const high = groups[6] ?? 0
  const low = groups[7] ?? 0
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}

function isPrivateIpv4(h: string): boolean {
  if (h === '0.0.0.0') return true
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  return /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)
}

function isPrivateIpv6(h: string): boolean {
  const groups = ipv6Groups(h)
  if (!groups) return /^(fe80|fc00|fd)/.test(h)
  if (groups.every(g => g === 0)) return true
  if (groups.slice(0, 7).every(g => g === 0) && groups[7] === 1) return true
  const first = groups[0] ?? 0
  if ((first & 0xffc0) === 0xfe80) return true
  if ((first & 0xfe00) === 0xfc00) return true
  const embedded = ipv4EmbeddedInIpv6(groups)
  return embedded !== '' && isPrivateIpv4(embedded)
}

export function isPrivateNetworkHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '').replace(/\.+$/, '')
  if (h === 'localhost') return true
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (isPrivateIpv4(h)) return true
  return isPrivateIpv6(h)
}
