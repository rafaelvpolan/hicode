import { test, expect, afterAll } from 'bun:test'
import { httpOk, waitHttp, probeArgs } from '../lib/runner/preview'
import { isLoopbackUrl, noProxyArgs } from '../lib/runner/loopback'
import { probeProviderHealth } from '../lib/ai/health-probe'

let acessosAoProxy = 0

const app = Bun.serve({
  port: 0,
  fetch(): Response {
    return new Response('preview vivo', { status: 200 })
  },
})

const proxy = Bun.serve({
  port: 0,
  fetch(): Response {
    acessosAoProxy++
    return new Response('este proxy nao serve o app', { status: 502 })
  },
})

const URL_LOCAL = `http://localhost:${app.port}`
const ENDERECO_PROXY = `http://127.0.0.1:${proxy.port}`
const CHAVES_PROXY = ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']
const CHAVES_SEM_PROXY = ['no_proxy', 'NO_PROXY']

const envAntes: Record<string, string | undefined> = {}
for (const chave of CHAVES_PROXY) {
  envAntes[chave] = process.env[chave]
  process.env[chave] = ENDERECO_PROXY
}
for (const chave of CHAVES_SEM_PROXY) {
  envAntes[chave] = process.env[chave]
  delete process.env[chave]
}
const ollamaAntes = process.env.HICODE_OLLAMA_URL

afterAll(() => {
  for (const chave of [...CHAVES_PROXY, ...CHAVES_SEM_PROXY]) {
    const valor = envAntes[chave]
    if (valor === undefined) delete process.env[chave]
    else process.env[chave] = valor
  }
  if (ollamaAntes === undefined) delete process.env.HICODE_OLLAMA_URL
  else process.env.HICODE_OLLAMA_URL = ollamaAntes
  app.stop(true)
  proxy.stop(true)
})

test('REGRESSAO: com http_proxy exportado, httpOk contra o preview local devolve TRUE e o proxy nao ve nada', async () => {
  const marca = acessosAoProxy
  expect(await httpOk(URL_LOCAL)).toBe(true)
  expect(acessosAoProxy).toBe(marca)
})

test('REGRESSAO: waitHttp reconhece o preview vivo em vez de queimar as tentativas contra o proxy', async () => {
  const marca = acessosAoProxy
  expect(await waitHttp(URL_LOCAL, 2)).toBe(true)
  expect(acessosAoProxy).toBe(marca)
})

test('o proxy exportado chega mesmo ao curl: destino fora do loopback continua saindo por ele', async () => {
  const marca = acessosAoProxy
  expect(await httpOk('http://alvo-remoto.invalido/')).toBe(false)
  expect(acessosAoProxy).toBe(marca + 1)
})

test('a sonda pede --noproxy so no loopback; para a internet o proxy segue sendo o caminho de saida', () => {
  expect(probeArgs(URL_LOCAL).slice(0, 3)).toEqual(['-q', '--noproxy', '*'])
  expect(probeArgs('https://api.anthropic.com')).not.toContain('--noproxy')
  expect(noProxyArgs('https://api.openai.com')).toEqual([])
  expect(noProxyArgs('http://gateway-pago.exemplo.com/api/generate')).toEqual([])
})

test('loopback reconhecido nas formas que preview e ollama usam; rede alheia fica de fora', () => {
  for (const url of ['http://localhost:5222', 'http://127.0.0.1:11434', 'http://127.1/', 'http://[::1]:3000', 'http://0.0.0.0:8080', 'http://app.localhost/']) {
    expect(isLoopbackUrl(url)).toBe(true)
  }
  for (const url of ['https://api.anthropic.com', 'http://10.0.0.5:11434', 'http://exemplo.com/', 'nao-e-url']) {
    expect(isLoopbackUrl(url)).toBe(false)
  }
})

test('health-probe do ollama local passa atras de proxy que nao serve o app', async () => {
  process.env.HICODE_OLLAMA_URL = URL_LOCAL
  const marca = acessosAoProxy
  expect(await probeProviderHealth('ollama')).toBe(true)
  expect(acessosAoProxy).toBe(marca)
})

test('REGRESSAO: host que apenas COMECA com 127. nao e loopback e nao ganha --noproxy', () => {
  expect(isLoopbackUrl('http://127.evil.com/x')).toBe(false)
  expect(isLoopbackUrl('http://127.0.0.1.evil.com/x')).toBe(false)
  expect(isLoopbackUrl('http://127.0.0.256/x')).toBe(false)
  expect(noProxyArgs('http://127.evil.com/x')).toEqual([])

  expect(isLoopbackUrl('http://127.0.0.1:3000/x')).toBe(true)
  expect(isLoopbackUrl('http://127.1.2.3/x')).toBe(true)
  expect(noProxyArgs('http://127.0.0.1:3000/x')).toEqual(['--noproxy', '*'])
})
