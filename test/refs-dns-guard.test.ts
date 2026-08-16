import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { HopFetcher, HopResponse } from '../lib/runner/redirect'
import type { AddressPin } from '../lib/runner/host-resolve'
import { curlArgs, downloadToFile, parseHop } from '../lib/runner/download'
import { run } from '../lib/runner/git'
import {
  DNS,
  LOGO,
  METADADOS_IP,
  PUBLICO,
  PUBLICO_V6,
  destino,
  dnsFalso,
  movedTo,
  net,
  recusa,
  segue,
} from './fixtures/rede-falsa'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-dns-'))

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

test('REGRESSAO: nome publico cujo A aponta para os metadados da nuvem e recusado antes de buscar', async () => {
  const n = net({ [LOGO]: movedTo('http://malvado.exemplo/latest/meta-data/') })
  const r = recusa(await segue(LOGO, n))
  expect(r.reason).toBe('host-bloqueado')
  expect(r.detail).toContain(METADADOS_IP)
  expect(n.visitados).toEqual([LOGO])
})

test('REGRESSAO: nome publico que resolve para loopback e recusado, na URL inicial e no salto', async () => {
  const inicial = net({})
  const r1 = recusa(await segue('http://espelho.exemplo/segredo', inicial))
  expect(r1.reason).toBe('host-bloqueado')
  expect(r1.detail).toContain('127.0.0.1')
  expect(inicial.visitados).toEqual([])

  const salto = net({ [LOGO]: movedTo('http://espelho6.exemplo/segredo') })
  const r2 = recusa(await segue(LOGO, salto))
  expect(r2.reason).toBe('host-bloqueado')
  expect(r2.detail).toContain('::1')
  expect(salto.visitados).toEqual([LOGO])
})

test('REGRESSAO: basta UM endereco interno na resposta do DNS para recusar o host', async () => {
  const n = net({})
  const r = recusa(await segue('http://duplo.exemplo/logo.png', n))
  expect(r.reason).toBe('host-bloqueado')
  expect(r.detail).toContain('::1')
  expect(n.visitados).toEqual([])
})

test('resolvedor que falha ou nao devolve endereco vira recusa nomeada, sem buscar nada', async () => {
  const quebrado = net({})
  const r1 = recusa(await segue(LOGO, quebrado, async () => { throw new Error('ENOTFOUND') }))
  expect(r1.reason).toBe('dns-falhou')
  expect(quebrado.visitados).toEqual([])

  const vazio = net({})
  const r2 = recusa(await segue(LOGO, vazio, async () => []))
  expect(r2.reason).toBe('dns-falhou')
  expect(vazio.visitados).toEqual([])
})

test('o endereco aprovado e fixado no fetch com --resolve, fechando a janela de rebinding', async () => {
  const n = net({})
  const r = destino(await segue(LOGO, n, dnsFalso({ 'cdn.exemplo.com': [PUBLICO, PUBLICO_V6] })))
  expect(r.url).toBe(LOGO)
  const pin = n.fixados[0] ?? null
  expect(pin?.host).toBe('cdn.exemplo.com')
  expect(pin?.port).toBe('443')
  expect(pin?.addresses).toEqual([PUBLICO, PUBLICO_V6])
  const args = curlArgs(LOGO, join(CARDS, 'ref-0.png'), pin)
  expect(args[args.indexOf('--resolve') + 1]).toBe(`cdn.exemplo.com:443:${PUBLICO},[${PUBLICO_V6}]`)
})

test('cada salto e fixado no proprio endereco aprovado, com a porta do salto', async () => {
  const n = net({ [LOGO]: movedTo('http://img.exemplo.com:8080/final.png') })
  destino(await segue(LOGO, n))
  expect(n.fixados.map(p => `${p?.host}:${p?.port}`)).toEqual(['cdn.exemplo.com:443', 'img.exemplo.com:8080'])
})

test('a porta implicita do esquema entra no --resolve', async () => {
  const n = net({})
  await segue('http://cdn.exemplo.com/a.png', n)
  expect(n.fixados[0]?.port).toBe('80')
})

test('host literal ja validado nao passa pelo resolvedor e nao e fixado', async () => {
  const n = net({})
  const r = destino(await segue('http://93.184.216.34/a.png', n, async () => { throw new Error('nao deveria resolver literal') }))
  expect(r.status).toBe(200)
  expect(n.fixados).toEqual([null])
})

test('REGRESSAO ponta a ponta: nome publico que resolve para loopback nao chega a bater no servidor interno', async () => {
  let pedidos = 0
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(): Response {
      pedidos++
      return new Response('AWS_SECRET_ACCESS_KEY=abc123', { status: 200 })
    },
  })
  const dest = join(CARDS, 'ref-rebind.png')
  try {
    const r = await downloadToFile(`http://espelho.exemplo:${server.port}/latest/meta-data/`, dest, undefined, DNS)
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.reason).toBe('host-bloqueado')
    expect(r.ok ? '' : r.detail).toContain('127.0.0.1')
    expect(existsSync(dest)).toBe(false)
    expect(pedidos).toBe(0)
  } finally {
    server.stop(true)
  }
})

test('downloadToFile aceita o buscador injetado e grava o destino quando o host e legitimo', async () => {
  const dest = join(CARDS, 'ref-injetado.png')
  const vistos: (AddressPin | null)[] = []
  const fetcher: HopFetcher = async (_url: string, pin: AddressPin | null): Promise<HopResponse> => {
    vistos.push(pin)
    writeFileSync(dest, 'PNGDATA')
    return { status: 200, location: '', failed: false }
  }
  const r = await downloadToFile(LOGO, dest, fetcher, DNS)
  expect(r.ok).toBe(true)
  expect(r.ok ? r.path : '').toBe(dest)
  expect(vistos[0]?.addresses).toEqual([PUBLICO])
  expect(readFileSync(dest, 'utf8')).toBe('PNGDATA')
})

test('contra curl de verdade: o --resolve gerado leva o fetch ao endereco aprovado', async () => {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(): Response {
      return new Response('PNGDATA', { status: 200 })
    },
  })
  const dest = join(CARDS, 'ref-fixado.png')
  const pin: AddressPin = { host: 'cdn.exemplo.com', port: String(server.port), addresses: ['127.0.0.1'] }
  try {
    const r = await run('curl', curlArgs(`http://cdn.exemplo.com:${server.port}/logo.png`, dest, pin), { timeout: 10000 })
    expect(parseHop(String(r.stdout || ''), !!r.err).status).toBe(200)
    expect(readFileSync(dest, 'utf8')).toBe('PNGDATA')
  } finally {
    server.stop(true)
  }
})
