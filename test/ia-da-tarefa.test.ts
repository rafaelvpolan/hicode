import { test, expect, beforeEach, afterEach } from 'bun:test'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { escolhaDeIa } from '../panel/server/hii/ia-da-tarefa'
import { clienteHii } from '../panel/server/hii/client.mjs'

const token = 'teste-ia-por-card-sem-credenciais-123456789'
let server: Server
let url = ''
let recebido: { metodo: string; caminho: string; ifMatch: string; corpo: string } | null = null

beforeEach(async () => {
  recebido = null
  server = createServer((req, res) => {
    let corpo = ''
    req.on('data', c => { corpo += c })
    req.on('end', () => {
      recebido = { metodo: req.method ?? '', caminho: req.url ?? '', ifMatch: String(req.headers['if-match'] ?? ''), corpo }
      res.writeHead(200, { 'content-type': 'application/json', etag: '"r2"' })
      if (req.url?.endsWith('/pacote')) res.end(JSON.stringify({ id: '025', hash: 'abc', status: 'aguardando', aprovadoHash: null, resumo: 'IA que implementa: claude', markdown: '## Prompt do implementador' }))
      else res.end(JSON.stringify({ id: '025', papeis: ['implement', 'verify', 'gate', 'step'], ias: [{ papel: 'implement', provedor: 'codex', modelo: '' }] }))
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const a = server.address()
  if (!a || typeof a === 'string') throw new Error('sem porta')
  url = `http://127.0.0.1:${a.port}`
})
afterEach(async () => { await new Promise<void>(r => server.close(() => r())) })

test('escolha de IA valida papel, provedor e modelo antes de chamar o motor', () => {
  expect(escolhaDeIa({ papel: 'implement', provedor: 'codex' })).toEqual({ papel: 'implement', provedor: 'codex' })
  expect(escolhaDeIa({ papel: 'gate', provedor: '' })).toEqual({ papel: 'gate', provedor: '' })
  expect(escolhaDeIa({ papel: 'faxina', provedor: 'codex' })).toBe('Papel invalido')
  expect(escolhaDeIa({ papel: 'implement', provedor: 'Codex; rm -rf' })).toBe('IA invalida')
  expect(escolhaDeIa({ papel: 'implement', provedor: 'ollama', modelo: 'qwen2.5-coder' })).toEqual({ papel: 'implement', provedor: 'ollama', modelo: 'qwen2.5-coder' })
})

test('o cliente do HII define a IA do card pela API com If-Match e idempotencia', async () => {
  const cliente = clienteHii(url, token)
  const r = await cliente.definirIaDaTarefa('025', { papel: 'implement', provedor: 'codex' }, 'hicode-ia-chave-teste', '"r1"')
  expect(recebido?.metodo).toBe('POST')
  expect(recebido?.caminho).toBe('/v1/tarefas/025/ia')
  expect(recebido?.ifMatch).toBe('"r1"')
  expect(JSON.parse(recebido?.corpo ?? '{}')).toEqual({ papel: 'implement', provedor: 'codex' })
  expect(r.valor.ias[0]?.provedor).toBe('codex')
})

test('o cliente do HII le o pacote de execucao sem tocar disco', async () => {
  const p = await clienteHii(url, token).pacote('025')
  expect(recebido?.caminho).toBe('/v1/tarefas/025/pacote')
  expect(p.valor.status).toBe('aguardando')
  expect(p.valor.markdown).toContain('Prompt do implementador')
})
