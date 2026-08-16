import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { curlArgs, parseHop } from '../lib/runner/download'
import type { HopResponse } from '../lib/runner/redirect'
import type { AddressPin } from '../lib/runner/host-resolve'
import { run } from '../lib/runner/git'
import { LOGO } from './fixtures/rede-falsa'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-curl-amb-'))
const SEGREDO = 'AWS_SECRET_ACCESS_KEY=abc123'

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

function homeCom(nome: string, curlrc: string): string {
  const h = join(BASE, nome)
  mkdirSync(h, { recursive: true })
  writeFileSync(join(h, '.curlrc'), curlrc)
  return h
}

function comProxy(porta: number): NodeJS.ProcessEnv {
  const endereco = `http://127.0.0.1:${porta}`
  return { ...process.env, http_proxy: endereco, https_proxy: endereco, ALL_PROXY: endereco }
}

async function busca(url: string, dest: string, pin: AddressPin | null, env: NodeJS.ProcessEnv): Promise<HopResponse> {
  const r = await run('curl', curlArgs(url, dest, pin), { timeout: 15000, env })
  return parseHop(String(r.stdout || ''), !!r.err)
}

function corpo(dest: string): string {
  return existsSync(dest) ? readFileSync(dest, 'utf8') : ''
}

test('-q vem antes de tudo: fora da primeira posicao o curl le o .curlrc assim mesmo', () => {
  const args = curlArgs(LOGO, join(BASE, 'ref-0.png'), null)
  expect(args[0]).toBe('-q')
  expect(args[args.indexOf('--noproxy') + 1]).toBe('*')
})

test('REGRESSAO: .curlrc do operador com "location" nao faz o curl seguir o redirect por fora da guarda', async () => {
  const interno = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: (): Response => new Response(SEGREDO) })
  const alvo = `http://127.0.0.1:${interno.port}/latest/meta-data/`
  const cdn = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (): Response => new Response('', { status: 302, headers: { Location: alvo } }),
  })
  const dest = join(BASE, 'ref-curlrc.png')
  try {
    const hop = await busca(`http://127.0.0.1:${cdn.port}/logo.png`, dest, null, { ...process.env, HOME: homeCom('home-hostil', 'location\n') })

    expect(hop.status).toBe(302)
    expect(hop.location).toBe(alvo)
    expect(corpo(dest)).not.toContain(SEGREDO)
  } finally {
    cdn.stop(true)
    interno.stop(true)
  }
})

test('REGRESSAO: .curlrc com proxy do operador nao rouba o fetch do endereco fixado por --resolve', async () => {
  let pedidosProxy = 0
  const proxy = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (): Response => { pedidosProxy++; return new Response(SEGREDO) },
  })
  const dest = join(BASE, 'ref-curlrc-proxy.png')
  const direto = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: (): Response => new Response('PNGDATA') })
  const pin: AddressPin = { host: 'cdn.exemplo.com', port: String(direto.port), addresses: ['127.0.0.1'] }
  try {
    const home = homeCom('home-proxy', `proxy = http://127.0.0.1:${proxy.port}\n`)
    const hop = await busca(`http://cdn.exemplo.com:${direto.port}/logo.png`, dest, pin, { ...process.env, HOME: home })

    expect(hop.status).toBe(200)
    expect(corpo(dest)).toBe('PNGDATA')
    expect(pedidosProxy).toBe(0)
  } finally {
    proxy.stop(true)
    direto.stop(true)
  }
})

test('REGRESSAO: http_proxy no ambiente nao anula o --resolve — o fetch vai ao endereco que o motor aprovou', async () => {
  let pedidosProxy = 0
  const proxy = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (): Response => { pedidosProxy++; return new Response(SEGREDO) },
  })
  const direto = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: (): Response => new Response('PNGDATA') })
  const dest = join(BASE, 'ref-proxy.png')
  const pin: AddressPin = { host: 'cdn.exemplo.com', port: String(direto.port), addresses: ['127.0.0.1'] }
  try {
    const hop = await busca(`http://cdn.exemplo.com:${direto.port}/logo.png`, dest, pin, comProxy(proxy.port))

    expect(hop.status).toBe(200)
    expect(corpo(dest)).toBe('PNGDATA')
    expect(corpo(dest)).not.toContain(SEGREDO)
    expect(pedidosProxy).toBe(0)
  } finally {
    proxy.stop(true)
    direto.stop(true)
  }
})

test('REGRESSAO: com proxy no ambiente e endereco aprovado inalcancavel, o download falha em vez de vazar pelo proxy', async () => {
  let pedidosProxy = 0
  const proxy = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (): Response => { pedidosProxy++; return new Response(SEGREDO) },
  })
  const morto = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: (): Response => new Response('') })
  const portaMorta = morto.port
  morto.stop(true)
  const dest = join(BASE, 'ref-proxy-morto.png')
  const pin: AddressPin = { host: 'cdn.exemplo.com', port: String(portaMorta), addresses: ['127.0.0.1'] }
  try {
    const hop = await busca(`http://cdn.exemplo.com:${portaMorta}/logo.png`, dest, pin, comProxy(proxy.port))

    expect(hop.failed).toBe(true)
    expect(pedidosProxy).toBe(0)
    expect(existsSync(dest)).toBe(false)
  } finally {
    proxy.stop(true)
  }
})
