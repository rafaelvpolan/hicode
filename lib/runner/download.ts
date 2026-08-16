import { execFile } from 'node:child_process'
import type { ExecFileException } from 'node:child_process'
import { existsSync, rmSync, statSync } from 'node:fs'
import { clip, refuse } from './url-guard'
import type { Refusal } from './url-guard'
import { followRedirects, MAX_REDIRECTS } from './redirect'
import type { HopFetcher, HopResponse } from './redirect'
import { lookupReal, pinnedResolveArg } from './host-resolve'
import type { AddressPin, HostResolver } from './host-resolve'

export const MAX_FILESIZE_BYTES = 10485760
const MAX_FILESIZE = String(MAX_FILESIZE_BYTES)
const MAX_TIME = '30'
const LIMIT_RATE = '2M'
const CURL_TIMEOUT_MS = 35000
const VIGIA_MS = 100

export interface Downloaded {
  ok: true
  path: string
  url: string
  status: number
  redirects: number
}

export type DownloadResult = Downloaded | Refusal

export function curlArgs(url: string, dest: string, pin: AddressPin | null): string[] {
  const fixado = pin ? ['--resolve', pinnedResolveArg(pin)] : []
  return [
    '-q',
    '--noproxy', '*',
    '-s', '-D', '-',
    '--max-filesize', MAX_FILESIZE,
    '--max-time', MAX_TIME,
    '--limit-rate', LIMIT_RATE,
    ...fixado,
    '-o', dest,
    url,
  ]
}

export function parseHop(headerDump: string, failed: boolean): HopResponse {
  let status = 0
  let location = ''
  for (const raw of headerDump.split('\n')) {
    const line = raw.trim()
    const started = /^HTTP\/[\d.]+\s+(\d{3})/.exec(line)
    if (started) {
      status = Number(started[1])
      location = ''
      continue
    }
    const loc = /^location:\s*(.*)$/i.exec(line)
    if (loc) location = (loc[1] ?? '').trim()
  }
  return { status, location, failed }
}

export function bytesEmDisco(p: string): number {
  try {
    return statSync(p).size
  } catch {
    return 0
  }
}

interface CurlRun {
  headers: string
  failed: boolean
  estourou: boolean
}

const CURL_FILESIZE_EXCEEDED = 63

function recusadoPeloTetoDoCurl(err: ExecFileException | null): boolean {
  return Number(err?.code) === CURL_FILESIZE_EXCEEDED
}

function curlComTeto(args: string[], dest: string): Promise<CurlRun> {
  return new Promise<CurlRun>((resolvido) => {
    let estourou = false
    let vigia: ReturnType<typeof setInterval> | null = null
    let prazo: ReturnType<typeof setTimeout> | null = null
    const child = execFile('curl', args, { maxBuffer: 1 << 22 }, (err, stdout) => {
      if (vigia) clearInterval(vigia)
      if (prazo) clearTimeout(prazo)
      const teto = estourou || recusadoPeloTetoDoCurl(err)
      resolvido({ headers: String(stdout ?? ''), failed: !!err || teto, estourou: teto })
    })
    const encerra = (): void => {
      try { child.kill('SIGKILL') } catch { void 0 }
    }
    vigia = setInterval(() => {
      if (bytesEmDisco(dest) <= MAX_FILESIZE_BYTES) return
      estourou = true
      encerra()
    }, VIGIA_MS)
    prazo = setTimeout(encerra, CURL_TIMEOUT_MS)
    vigia.unref?.()
    prazo.unref?.()
  })
}

function tetoEstourado(alvo: string, lidos: number): Refusal {
  return refuse('arquivo-grande-demais', `${clip(alvo)} passou do teto de ${MAX_FILESIZE_BYTES} bytes (${lidos} gravados)`)
}

function respostaDeErro(alvo: string, status: number): Refusal {
  return refuse('resposta-de-erro', `${clip(alvo)} respondeu HTTP ${status} — o corpo salvo e a pagina de erro, nao a imagem`)
}

function redirectSemDestino(alvo: string, status: number): Refusal {
  return refuse('resposta-de-erro', `${clip(alvo)} terminou a cadeia em HTTP ${status} sem Location — o corpo em disco nao e a imagem`)
}

function respostaVazia(alvo: string, status: number): Refusal {
  return refuse('resposta-vazia', `${clip(alvo)} respondeu HTTP ${status} com corpo de 0 bytes — nao ha imagem para abrir`)
}

export function curlHopFetcher(dest: string): HopFetcher {
  return async (url: string, pin: AddressPin | null): Promise<HopResponse> => {
    const r = await curlComTeto(curlArgs(url, dest, pin), dest)
    const hop = parseHop(r.headers, r.failed)
    if (!r.estourou) return hop
    const lidos = bytesEmDisco(dest)
    rmSync(dest, { force: true })
    return { ...hop, failed: true, refusal: tetoEstourado(url, lidos) }
  }
}

export async function downloadToFile(
  url: string,
  dest: string,
  fetchHop: HopFetcher = curlHopFetcher(dest),
  resolverHost: HostResolver = lookupReal,
): Promise<DownloadResult> {
  const followed = await followRedirects(url, fetchHop, MAX_REDIRECTS, resolverHost)
  if (!followed.ok) {
    rmSync(dest, { force: true })
    return followed
  }
  if (!existsSync(dest)) {
    return refuse('transporte-falhou', `curl nao gravou nada a partir de ${clip(followed.url)}`)
  }
  if (followed.status >= 400) {
    rmSync(dest, { force: true })
    return respostaDeErro(followed.url, followed.status)
  }
  if (followed.status >= 300) {
    rmSync(dest, { force: true })
    return redirectSemDestino(followed.url, followed.status)
  }
  const gravados = bytesEmDisco(dest)
  if (gravados > MAX_FILESIZE_BYTES) {
    rmSync(dest, { force: true })
    return tetoEstourado(followed.url, gravados)
  }
  if (gravados === 0) {
    rmSync(dest, { force: true })
    return respostaVazia(followed.url, followed.status)
  }
  return { ok: true, path: dest, url: followed.url, status: followed.status, redirects: followed.redirects }
}
