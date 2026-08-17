import { test, expect, afterAll } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { curlHopFetcher, downloadToFile } from '../lib/runner/download'
import type { DownloadResult } from '../lib/runner/download'
import type { AddressPin } from '../lib/runner/host-resolve'
import type { HopFetcher, HopResponse } from '../lib/runner/redirect'
import { DNS } from './fixtures/rede-falsa'
import { portaDe } from './fixtures/porta-servidor'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-resposta-'))
const HOST = 'cdn.exemplo.com'

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

function servidor(status: number, corpo: string | null): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (): Response => new Response(corpo, { status, headers: { 'content-type': 'image/png' } }),
  })
}

function curlFixadoEm(dest: string, porta: number): HopFetcher {
  const real = curlHopFetcher(dest)
  const pin: AddressPin = { host: HOST, port: String(porta), addresses: ['127.0.0.1'] }
  return (url: string): Promise<HopResponse> => real(url, pin)
}

function servidorDeCadeia(corpoDoSalto: string): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (req): Response => {
      if (new URL(req.url).pathname === '/ref.png') {
        return new Response(corpoDoSalto, { status: 302, headers: { Location: '/final.png' } })
      }
      return new Response(null, { status: 304 })
    },
  })
}

interface Baixado {
  r: DownloadResult
  dest: string
}

async function baixaDe(nome: string, status: number, corpo: string | null): Promise<Baixado> {
  const s = servidor(status, corpo)
  const dest = join(BASE, nome)
  try {
    const porta = portaDe(s)
    const url = `http://${HOST}:${porta}/ref.png`
    return { r: await downloadToFile(url, dest, curlFixadoEm(dest, porta), DNS), dest }
  } finally {
    s.stop(true)
  }
}

function motivo(r: DownloadResult): string {
  return r.ok ? '' : r.reason
}

function detalhe(r: DownloadResult): string {
  return r.ok ? '' : r.detail
}

test('REGRESSAO: 404 com pagina de erro nao vira imagem de referencia — recusa tipada e destino apagado', async () => {
  const { r, dest } = await baixaDe('ref-404.png', 404, '<html>404 Not Found — nginx</html>')

  expect(r.ok).toBe(false)
  expect(motivo(r)).toBe('resposta-de-erro')
  expect(detalhe(r)).toContain('404')
  expect(detalhe(r)).toContain(HOST)
  expect(existsSync(dest)).toBe(false)
}, 30000)

test('REGRESSAO: 410 de link morto responde corpo vazio e ainda assim e recusado pelo status', async () => {
  const { r, dest } = await baixaDe('ref-410.png', 410, null)

  expect(motivo(r)).toBe('resposta-de-erro')
  expect(detalhe(r)).toContain('410')
  expect(existsSync(dest)).toBe(false)
}, 30000)

test('REGRESSAO: toda a familia 4xx/5xx e recusada, nao so o 404', async () => {
  for (const status of [400, 403, 429, 500, 503]) {
    const { r, dest } = await baixaDe(`ref-${status}.png`, status, 'erro do servidor')

    expect(motivo(r)).toBe('resposta-de-erro')
    expect(detalhe(r)).toContain(String(status))
    expect(existsSync(dest)).toBe(false)
  }
}, 60000)

test('REGRESSAO: 200 com corpo de 0 bytes e recusado com motivo proprio, distinto da resposta de erro', async () => {
  const { r, dest } = await baixaDe('ref-vazio.png', 200, null)

  expect(r.ok).toBe(false)
  expect(motivo(r)).toBe('resposta-vazia')
  expect(detalhe(r)).toContain('0 bytes')
  expect(existsSync(dest)).toBe(false)
}, 30000)

test('REGRESSAO: 204 sem conteudo tambem nao passa por imagem de referencia', async () => {
  const { r, dest } = await baixaDe('ref-204.png', 204, null)

  expect(motivo(r)).toBe('resposta-vazia')
  expect(existsSync(dest)).toBe(false)
}, 30000)

test('REGRESSAO: 302 sem Location e resposta final e o corpo do redirect quebrado nao vira imagem de referencia', async () => {
  const { r, dest } = await baixaDe('ref-302-sem-location.png', 302, '<html>redirect quebrado</html>')

  expect(r.ok).toBe(false)
  expect(motivo(r)).toBe('resposta-de-erro')
  expect(detalhe(r)).toContain('302')
  expect(detalhe(r)).toContain(HOST)
  expect(existsSync(dest)).toBe(false)
}, 30000)

test('REGRESSAO: 304 no fim da cadeia nao deixa o corpo do salto 302 sobreviver em disco como imagem', async () => {
  const s = servidorDeCadeia('<html>redirect quebrado</html>')
  const dest = join(BASE, 'ref-304-em-cadeia.png')
  try {
    const porta = portaDe(s)
    const url = `http://${HOST}:${porta}/ref.png`
    const r = await downloadToFile(url, dest, curlFixadoEm(dest, porta), DNS)

    expect(r.ok).toBe(false)
    expect(motivo(r)).toBe('resposta-de-erro')
    expect(detalhe(r)).toContain('304')
    expect(existsSync(dest)).toBe(false)
  } finally {
    s.stop(true)
  }
}, 30000)

test('200 com imagem de verdade continua chegando ao destino', async () => {
  const { r, dest } = await baixaDe('ref-ok.png', 200, 'PNGDATA')

  expect(r.ok).toBe(true)
  expect(r.ok ? r.status : 0).toBe(200)
  expect(readFileSync(dest, 'utf8')).toBe('PNGDATA')
}, 30000)
