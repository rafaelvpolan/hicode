import { test, expect, beforeEach, afterEach } from 'bun:test'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { consultarStatusMotor, comMotorDisponivel, filaLocal } from '../panel/server/hii/status'
import { transition } from '../panel/server/card/acoes'

let base = ''
let server: Server
let httpStatus = 200
let resposta: Record<string, unknown>
let arquivo = ''
let consultas = 0
let partidas = 0
let partidaOk = true
beforeEach(async () => {
  base = mkdtempSync(join(tmpdir(), 'hicode-admissao-'))
  process.env.HICODE_CARDS_DIR = join(base, 'hicode', 'cards')
  mkdirSync(process.env.HICODE_CARDS_DIR, { recursive: true })
  arquivo = join(process.env.HICODE_CARDS_DIR, '025-regressao.md')
  writeFileSync(arquivo, '---\nid: 025\nstatus: READY\ntitle: Regressao\n---\n## Objetivo\nNao executar IA.\n')
  httpStatus = 200
  consultas = 0
  partidas = 0
  partidaOk = true
  process.env.HICODE_MOTOR_AUTOSTART = '0'
  resposta = { protocolo: 1, estado: 'ligado', versao: '1.2.3', versaoEmExecucao: '1.2.2', fila: filaLocal(), consultadoEm: new Date().toISOString(), motivo: 'Daemon ligado.' }
  server = createServer((req, res) => {
    consultas++
    if (req.url === '/v1/motor/iniciar') {
      partidas++
      expect(req.method).toBe('POST')
      if (partidaOk) resposta.estado = 'ligado'
      res.writeHead(partidaOk ? 200 : 503, { 'content-type': 'application/json' })
      res.end(JSON.stringify(resposta))
      return
    }
    expect(req.url).toBe('/v1/motor/status')
    expect(req.headers.authorization).toBe('Bearer ' + process.env.HII_API_TOKEN)
    res.writeHead(httpStatus, { 'content-type': 'application/json' })
    res.end(JSON.stringify(resposta))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('fixture sem porta')
  process.env.HII_API_URL = 'http://127.0.0.1:' + addr.port
  process.env.HII_API_TOKEN = 'token-exclusivo-da-fixture-1234567890'
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  rmSync(base, { recursive: true, force: true })
})
async function bloqueiaSemMudar(): Promise<void> {
  const antes = readFileSync(arquivo, 'utf8')
  await expect(comMotorDisponivel(() => transition('025', 'EXECUTING'))).rejects.toThrow()
  expect(readFileSync(arquivo, 'utf8')).toBe(antes)
}
test('regressao #025: filas diferentes recusam inicio sem alterar card ou log', async () => {
  resposta.fila = 'a'.repeat(64)
  await bloqueiaSemMudar()
})
test('sem configuracao da API nao anuncia execucao', async () => {
  delete process.env.HII_API_URL
  await bloqueiaSemMudar()
  expect(consultas).toBe(0)
})
test('API viva, daemon desligado: preserva tarefa e informa versao instalada', async () => {
  resposta.estado = 'desligado'
  resposta.versaoEmExecucao = null
  await bloqueiaSemMudar()
  expect((await consultarStatusMotor()).versao).toBe('1.2.3')
})
test('API fora do ar nao e confundida com daemon desligado', async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  expect((await consultarStatusMotor()).estado).toBe('indisponivel')
  await bloqueiaSemMudar()
})
test('401 e 403 mostram acesso recusado, sem executar a tarefa', async () => {
  for (const status of [401, 403]) {
    httpStatus = status
    expect((await consultarStatusMotor()).estado).toBe('nao_autorizado')
    await bloqueiaSemMudar()
  }
})
test('API antiga e resposta malformada nao viram motor disponivel', async () => {
  httpStatus = 404
  expect((await consultarStatusMotor()).estado).toBe('incompativel')
  await bloqueiaSemMudar()
  httpStatus = 200
  resposta = { estado: 'ligado' }
  await bloqueiaSemMudar()
})
test('motor degradado ou sem prova recente bloqueia admissao', async () => {
  for (const estado of ['degradado', 'desconhecido']) {
    resposta.estado = estado
    await bloqueiaSemMudar()
  }
})
test('consulta nao retoma tarefa pausada; versao em execucao pode diferir da instalada', async () => {
  transition('025', 'PAUSED')
  const antes = readFileSync(arquivo, 'utf8')
  const s = await consultarStatusMotor()
  expect(s.versaoEmExecucao).toBe('1.2.2')
  expect(s.versao).toBe('1.2.3')
  expect(readFileSync(arquivo, 'utf8')).toBe(antes)
})
test('mesma fila e motor ligado permitem a operacao uma vez', async () => {
  let chamadas = 0
  const r = await comMotorDisponivel(() => { chamadas++; return transition('025', 'READY') })
  expect(chamadas).toBe(1)
  expect(r?.status).toBe('READY')
})

test('autostart opt-in usa a API e so libera depois de confirmar ligado', async () => {
  process.env.HICODE_MOTOR_AUTOSTART = '1'
  resposta.estado = 'desligado'
  await consultarStatusMotor()
  expect(partidas).toBe(0)
  await comMotorDisponivel(() => transition('025', 'READY'))
  expect(partidas).toBe(1)
})
test('falha de partida preserva o arquivo e nao marca EXECUTING', async () => {
  process.env.HICODE_MOTOR_AUTOSTART = '1'
  resposta.estado = 'desligado'
  partidaOk = false
  await bloqueiaSemMudar()
  expect(partidas).toBe(1)
})
test('autostart nunca inicia outra fila', async () => {
  process.env.HICODE_MOTOR_AUTOSTART = '1'
  resposta.estado = 'desligado'
  resposta.fila = 'f'.repeat(64)
  await bloqueiaSemMudar()
  expect(partidas).toBe(0)
})
