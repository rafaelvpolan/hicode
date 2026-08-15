import { test, expect, afterAll } from 'bun:test'
import { probeProviderHealth } from '../lib/ai/health-probe'

let statusCode = 200
const server = Bun.serve({
  port: 0,
  fetch(): Response {
    return new Response('', { status: statusCode })
  },
})
const baseUrl = `http://localhost:${server.port}`

afterAll(() => server.stop(true))

test('provedor com string vazia: nao sonda, assume saudavel (nada a checar)', async () => {
  expect(await probeProviderHealth('')).toBe(true)
})

test('provedor sem endpoint conhecido (ex.: opencode) assume saudavel sem sondar a rede', async () => {
  expect(await probeProviderHealth('opencode')).toBe(true)
})

test('ollama: http 200 na url configurada e saudavel', async () => {
  statusCode = 200
  process.env.HICODE_OLLAMA_URL = baseUrl
  expect(await probeProviderHealth('ollama')).toBe(true)
})

test('ollama: 5xx do proprio servidor local conta como insalubre', async () => {
  statusCode = 503
  process.env.HICODE_OLLAMA_URL = baseUrl
  expect(await probeProviderHealth('ollama')).toBe(false)
})

test('ollama: porta sem ninguem escutando e insalubre (nao trava, nao lanca)', async () => {
  process.env.HICODE_OLLAMA_URL = 'http://localhost:1'
  expect(await probeProviderHealth('ollama')).toBe(false)
})
