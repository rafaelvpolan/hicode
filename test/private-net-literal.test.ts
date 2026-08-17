import { test, expect } from 'bun:test'
import { isPrivateNetworkHost } from '../lib/runner/private-net'
import { isLoopbackHost } from '../lib/runner/loopback'
import { isBlockedHost, validateHttpUrl } from '../lib/runner/url-guard'

test('REGRESSAO: nome de dominio que so comeca como faixa privada deixa de ser bloqueado', () => {
  for (const h of ['127.evil.com', '10.evil.com', '192.168.evil.com']) {
    expect(isPrivateNetworkHost(h)).toBe(false)
    expect(isBlockedHost(h)).toBe(false)
  }
  expect(validateHttpUrl('https://10.evil.com/a.png').ok).toBe(true)
})

test('REGRESSAO: prefixo de faixa privada em nome so e recusado quando ha literal IPv4 completo', () => {
  for (const h of ['172.16.evil.com', '169.254.evil.com', '100.64.evil.com', '0.0.0.0.evil.com']) {
    expect(isPrivateNetworkHost(h)).toBe(false)
  }
  for (const h of ['172.16.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0']) {
    expect(isPrivateNetworkHost(h)).toBe(true)
  }
})

test('literais privados continuam bloqueados apos exigir os quatro octetos', () => {
  for (const h of ['127.0.0.1', '127.255.255.254', '10.0.0.0', '10.255.255.255', '192.168.0.9', '169.254.169.254', '0.0.0.0']) {
    expect(isPrivateNetworkHost(h)).toBe(true)
  }
})

test('as bordas de 172.16/12 e 100.64/10 continuam onde estavam', () => {
  for (const h of ['172.16.0.1', '172.31.255.254', '100.64.0.1', '100.127.255.254']) {
    expect(isPrivateNetworkHost(h)).toBe(true)
  }
  for (const h of ['172.15.255.254', '172.32.0.1', '100.63.255.254', '100.128.0.1']) {
    expect(isPrivateNetworkHost(h)).toBe(false)
  }
})

test('IPv4 embutido em IPv6 continua chegando validado ao teste de faixa', () => {
  for (const h of ['[::ffff:127.0.0.1]', '[::ffff:169.254.169.254]', '[::ffff:10.0.0.1]', '[::ffff:172.16.0.1]', '[::ffff:100.64.0.1]', '[::ffff:192.168.0.9]', '[::ffff:0.0.0.0]']) {
    expect(isPrivateNetworkHost(h)).toBe(true)
  }
  for (const h of ['[::ffff:8.8.8.8]', '[::ffff:172.32.0.1]', '[::ffff:100.128.0.1]']) {
    expect(isPrivateNetworkHost(h)).toBe(false)
  }
})

test('literal IPv4 malformado nao vira host privado por acidente', () => {
  for (const h of ['999.0.0.1', '127.0.0', '127.0.0.1.2', '10.0.0.256', '', 'cdn.exemplo.com']) {
    expect(isPrivateNetworkHost(h)).toBe(false)
  }
})

test('REGRESSAO: nome de dominio com prefixo de faixa IPv6 privada deixa de ser bloqueado', () => {
  for (const h of ['fd-assets.cloudfront.net', 'fdn.com', 'fc00.io', 'fe80cdn.net', 'FDN.COM']) {
    expect(isPrivateNetworkHost(h)).toBe(false)
    expect(isBlockedHost(h)).toBe(false)
  }
  expect(validateHttpUrl('https://fdn.com/a.png').ok).toBe(true)
})

test('literal IPv6 privado continua bloqueado com ou sem colchete, inclusive o que nao parseia', () => {
  for (const h of ['[fd00::1]', '[fe80::1]', '[fc00::1]', 'fd00::1', 'fe80::1%eth0', '[fe80::1:2:3:4:5:6:7:8]']) {
    expect(isPrivateNetworkHost(h)).toBe(true)
  }
})

test('a guarda de rede privada e a de loopback leem o mesmo literal IPv4', () => {
  for (const h of ['127.evil.com', '127.0.0', '999.0.0.1']) {
    expect(isLoopbackHost(h)).toBe(false)
    expect(isPrivateNetworkHost(h)).toBe(false)
  }
  for (const h of ['127.0.0.1', '127.255.255.254', '0.0.0.0']) {
    expect(isLoopbackHost(h)).toBe(true)
    expect(isPrivateNetworkHost(h)).toBe(true)
  }
})
