import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, existsSync, utimesSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { tmpdir, hostname } from 'node:os'
import { withFileLock } from '../panel/server/card/bloqueio'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-filelock-'))

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

let seq = 0

function alvoDeTeste(): string {
  return join(BASE, `alvo-${++seq}.md`)
}

test('withFileLock executa fn e nao deixa o arquivo de lock para tras', () => {
  const alvo = alvoDeTeste()
  const resultado = withFileLock(alvo, () => 'ok')
  expect(resultado).toBe('ok')
  expect(existsSync(`${alvo}.lock`)).toBe(false)
})

test('withFileLock libera o lock mesmo quando fn lanca — a proxima chamada nao fica presa', () => {
  const alvo = alvoDeTeste()
  expect(() => withFileLock(alvo, () => { throw new Error('falha dentro da secao critica') })).toThrow('falha dentro da secao critica')
  expect(existsSync(`${alvo}.lock`)).toBe(false)
  expect(withFileLock(alvo, () => 'seguiu em frente depois da falha anterior')).toBe('seguiu em frente depois da falha anterior')
})

test('REGRESSAO: um lock orfao muito alem do prazo de obsolescencia e roubado em vez de esperar o timeout inteiro', () => {
  const alvo = alvoDeTeste()
  const lockOrfao = `${alvo}.lock`
  const pid = Number(execFileSync('node', ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }))
  writeFileSync(lockOrfao, JSON.stringify({ versao: 1, pid, host: hostname(), token: randomUUID() }))
  const bemVelho = new Date(Date.now() - 10 * 60 * 1000)
  utimesSync(lockOrfao, bemVelho, bemVelho)

  const inicio = Date.now()
  const resultado = withFileLock(alvo, () => 'destravou')
  const duracao = Date.now() - inicio

  expect(resultado).toBe('destravou')
  expect(duracao).toBeLessThan(2000)
  expect(existsSync(lockOrfao)).toBe(false)
})

test('idade e timeout nao roubam lock de dono vivo ou legado desconhecido', () => {
  const anterior = process.env.HICODE_LOCK_TIMEOUT_MS
  process.env.HICODE_LOCK_TIMEOUT_MS = '15'
  try {
    for (const conteudo of ['', JSON.stringify({ versao: 1, pid: process.pid, host: hostname(), token: 'vivo' })]) {
      const alvo = alvoDeTeste()
      writeFileSync(`${alvo}.lock`, conteudo)
      utimesSync(`${alvo}.lock`, new Date(0), new Date(0))
      expect(() => withFileLock(alvo, () => 'indevido')).toThrow('nenhum lock ativo foi removido')
      expect(readFileSync(`${alvo}.lock`, 'utf8')).toBe(conteudo)
    }
  } finally {
    if (anterior === undefined) delete process.env.HICODE_LOCK_TIMEOUT_MS
    else process.env.HICODE_LOCK_TIMEOUT_MS = anterior
  }
})

test('liberacao nunca remove lock substituido por outro dono', () => {
  const alvo = alvoDeTeste()
  const outro = { versao: 1, pid: process.pid, host: hostname(), token: 'outro' }
  withFileLock(alvo, () => writeFileSync(`${alvo}.lock`, JSON.stringify(outro)))
  expect(JSON.parse(readFileSync(`${alvo}.lock`, 'utf8')).token).toBe('outro')
})
