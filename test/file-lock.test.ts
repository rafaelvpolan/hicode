import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, existsSync, closeSync, openSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { withFileLock } from '../lib/runner/file-lock'

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
  closeSync(openSync(lockOrfao, 'w'))
  const bemVelho = new Date(Date.now() - 10 * 60 * 1000)
  utimesSync(lockOrfao, bemVelho, bemVelho)

  const inicio = Date.now()
  const resultado = withFileLock(alvo, () => 'destravou')
  const duracao = Date.now() - inicio

  expect(resultado).toBe('destravou')
  expect(duracao).toBeLessThan(2000)
  expect(existsSync(lockOrfao)).toBe(false)
})
