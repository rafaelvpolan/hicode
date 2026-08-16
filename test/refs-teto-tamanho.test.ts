import { test, expect, afterAll } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MAX_FILESIZE_BYTES, bytesEmDisco, curlArgs, curlHopFetcher, downloadToFile } from '../lib/runner/download'
import type { HopFetcher, HopResponse } from '../lib/runner/redirect'
import { refuse } from '../lib/runner/url-guard'
import { DNS, LOGO } from './fixtures/rede-falsa'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-teto-'))
const PEDACO = new Uint8Array(256 * 1024).fill(65)

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

function semContentLength(total: number): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(): Response {
      let enviados = 0
      const corpo = new ReadableStream({
        pull(controller) {
          if (enviados >= total) {
            controller.close()
            return
          }
          controller.enqueue(PEDACO)
          enviados += PEDACO.byteLength
        },
      })
      return new Response(corpo, { status: 200, headers: { 'content-type': 'image/png' } })
    },
  })
}

test('curl recebe teto de taxa: o pico em disco nao depende do servidor cooperar', () => {
  const args = curlArgs(LOGO, join(BASE, 'ref-args.png'), null)
  expect(args[args.indexOf('--max-filesize') + 1]).toBe(String(MAX_FILESIZE_BYTES))
  expect(args[args.indexOf('--max-time') + 1]).toBe('30')
  expect(args[args.indexOf('--limit-rate') + 1]).toBe('2M')
})

test('REGRESSAO: resposta chunked acima do teto e recusada e o destino NAO existe', async () => {
  const servidor = semContentLength(40 * 1024 * 1024)
  const dest = join(BASE, 'ref-chunked.png')
  try {
    const hop = await curlHopFetcher(dest)(`http://127.0.0.1:${servidor.port}/grande.png`, null)

    expect(hop.failed).toBe(true)
    expect(hop.refusal?.reason).toBe('arquivo-grande-demais')
    expect(hop.refusal?.detail).toContain(String(MAX_FILESIZE_BYTES))
    expect(existsSync(dest)).toBe(false)
  } finally {
    servidor.stop(true)
  }
}, 60000)

test('REGRESSAO: Content-Length acima do teto e recusado com o mesmo motivo tipado, sem gravar nada', async () => {
  const servidor = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (): Response => new Response('A'.repeat(MAX_FILESIZE_BYTES + 1024)),
  })
  const dest = join(BASE, 'ref-anunciado.png')
  try {
    const hop = await curlHopFetcher(dest)(`http://127.0.0.1:${servidor.port}/grande.png`, null)

    expect(hop.failed).toBe(true)
    expect(hop.refusal?.reason).toBe('arquivo-grande-demais')
    expect(existsSync(dest)).toBe(false)
  } finally {
    servidor.stop(true)
  }
}, 60000)

test('resposta chunked dentro do teto continua chegando inteira ao destino', async () => {
  const servidor = semContentLength(512 * 1024)
  const dest = join(BASE, 'ref-pequeno.png')
  try {
    const hop = await curlHopFetcher(dest)(`http://127.0.0.1:${servidor.port}/logo.png`, null)

    expect(hop.failed).toBe(false)
    expect(hop.refusal).toBeUndefined()
    expect(bytesEmDisco(dest)).toBe(512 * 1024)
  } finally {
    servidor.stop(true)
  }
}, 60000)

test('REGRESSAO: arquivo acima do teto gravado por um transporte que mentiu e descartado do destino', async () => {
  const dest = join(BASE, 'ref-mentiroso.png')
  const fetchHop: HopFetcher = async (): Promise<HopResponse> => {
    writeFileSync(dest, 'A'.repeat(MAX_FILESIZE_BYTES + 1))
    return { status: 200, location: '', failed: false }
  }

  const r = await downloadToFile(LOGO, dest, fetchHop, DNS)

  expect(r.ok).toBe(false)
  expect(r.ok ? '' : r.reason).toBe('arquivo-grande-demais')
  expect(existsSync(dest)).toBe(false)
})

test('recusa por teto atravessa a cadeia de redirect com o motivo intacto', async () => {
  const dest = join(BASE, 'ref-cadeia.png')
  const fetchHop: HopFetcher = async (): Promise<HopResponse> => ({
    status: 200,
    location: '',
    failed: true,
    refusal: refuse('arquivo-grande-demais', 'estourou no primeiro salto'),
  })

  const r = await downloadToFile(LOGO, dest, fetchHop, DNS)

  expect(r.ok ? '' : r.reason).toBe('arquivo-grande-demais')
  expect(existsSync(dest)).toBe(false)
})

test('arquivo exatamente no teto passa: a fronteira e "acima do teto", nao "no teto"', async () => {
  const dest = join(BASE, 'ref-no-limite.png')
  const fetchHop: HopFetcher = async (): Promise<HopResponse> => {
    writeFileSync(dest, 'A'.repeat(MAX_FILESIZE_BYTES))
    return { status: 200, location: '', failed: false }
  }

  const r = await downloadToFile(LOGO, dest, fetchHop, DNS)

  expect(r.ok).toBe(true)
  expect(bytesEmDisco(dest)).toBe(MAX_FILESIZE_BYTES)
})
