import { test, expect } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

process.env.HICODE_CARDS_DIR = mkdtempSync(join(tmpdir(), 'hicode-motor-cliente-cards-'))

const { motorClient } = await import('../panel/server/motor/index')
const { transporteConfigurado } = await import('../panel/server/motor/transporte')

test('transporteConfigurado, hoje, so conhece processo-local — HTTP/SSE ainda nao existe', () => {
  expect(transporteConfigurado()).toBe('processo-local')
})

test('motorClient expoe exatamente a interface MotorClient (status, dispatch, acompanhar, acompanharQuadro, entrypoint)', () => {
  expect(typeof motorClient.status).toBe('function')
  expect(typeof motorClient.dispatch).toBe('function')
  expect(typeof motorClient.acompanhar).toBe('function')
  expect(typeof motorClient.acompanharQuadro).toBe('function')
  expect(typeof motorClient.entrypoint).toBe('function')
})

test('motorClient.dispatch(["merge"]) e recusado atraves do cliente composto, nao so na funcao interna', async () => {
  const resultado = await motorClient.dispatch(['merge'])
  expect(resultado.ok).toBe(false)
  expect(resultado.stderr).toContain('merge e sempre humano')
})

test('motorClient.dispatch nao aceita merge disfarcado de segundo argumento', async () => {
  const resultado = await motorClient.dispatch(['--once', 'merge'])
  expect(resultado.ok).toBe(false)
  expect(resultado.stderr).toContain('merge e sempre humano')
})

test('motorClient.status() le o estado do disco sem lancar, mesmo sem daemon rodando (contrato minimo do MotorStatus)', () => {
  const status = motorClient.status()
  expect(typeof status.cardCount).toBe('number')
  expect(typeof status.iaConfigured).toBe('boolean')
  expect(status.daemon.running).toBe(false)
})
