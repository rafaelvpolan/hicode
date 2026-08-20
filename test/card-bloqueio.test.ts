import { test, expect, afterAll } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-card-bloqueio-'))
const BLOQUEIO_TS = join(dirname(dirname(fileURLToPath(import.meta.url))), 'panel', 'server', 'card', 'bloqueio.ts')

const { withFileLock, writeFileAtomic } = await import('../panel/server/card/bloqueio')

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

interface RegistroDeContencao {
  label: string
  inicio: number
  fim: number
}

function intervalosSeSobrepoem(a: RegistroDeContencao, b: RegistroDeContencao): boolean {
  return a.inicio < b.fim && b.inicio < a.fim
}

function rodarProcesso(comando: string, args: string[]): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const filho = spawn(comando, args, { stdio: 'inherit' })
    filho.on('error', rejectPromise)
    filho.on('exit', code => resolvePromise(code ?? -1))
  })
}

test('withFileLock roda a funcao e devolve o retorno dela, sem deixar o .lock para tras', () => {
  const alvo = join(BASE, 'a.md')
  const resultado = withFileLock(alvo, () => 'resultado-x')
  expect(resultado).toBe('resultado-x')
  expect(existsSync(`${alvo}.lock`)).toBe(false)
})

test('withFileLock libera o .lock mesmo quando a funcao lanca, e propaga o erro original', () => {
  const alvo = join(BASE, 'b.md')
  expect(() => withFileLock(alvo, () => { throw new Error('quebrou dentro do lock') })).toThrow('quebrou dentro do lock')
  expect(existsSync(`${alvo}.lock`)).toBe(false)
})

test('withFileLock rouba um .lock parado (mais velho que o limite de stale) em vez de travar para sempre', () => {
  const alvo = join(BASE, 'c.md')
  const lock = `${alvo}.lock`
  writeFileSync(lock, '')
  const antigo = Date.now() - 20_000
  utimesSync(lock, antigo / 1000, antigo / 1000)

  const inicio = Date.now()
  const resultado = withFileLock(alvo, () => 'passou-por-cima-do-lock-parado')
  const duracaoMs = Date.now() - inicio

  expect(resultado).toBe('passou-por-cima-do-lock-parado')
  expect(duracaoMs).toBeLessThan(2000)
  expect(existsSync(lock)).toBe(false)
})

test('withFileLock serializa dois PROCESSOS reais disputando o mesmo arquivo — as janelas de posse nunca se sobrepoem', async () => {
  const alvo = join(BASE, 'd.md')
  const saida = join(BASE, 'd.contencao.jsonl')
  const worker = join(BASE, 'd.worker.mjs')
  writeFileSync(worker, [
    `import { withFileLock } from ${JSON.stringify(BLOQUEIO_TS)}`,
    `import { appendFileSync } from 'node:fs'`,
    `const [, , alvo, saida, label] = process.argv`,
    `withFileLock(alvo, () => {`,
    `  const inicio = Date.now()`,
    `  const buffer = new Int32Array(new SharedArrayBuffer(4))`,
    `  Atomics.wait(buffer, 0, 0, 150)`,
    `  const fim = Date.now()`,
    `  appendFileSync(saida, JSON.stringify({ label, inicio, fim }) + '\\n')`,
    `})`,
  ].join('\n'))

  const [codigoA, codigoB] = await Promise.all([
    rodarProcesso(process.execPath, [worker, alvo, saida, 'A']),
    rodarProcesso(process.execPath, [worker, alvo, saida, 'B']),
  ])
  expect(codigoA, 'processo A do teste de contencao terminou com erro').toBe(0)
  expect(codigoB, 'processo B do teste de contencao terminou com erro').toBe(0)

  const registros: RegistroDeContencao[] = readFileSync(saida, 'utf8')
    .trim()
    .split('\n')
    .map(linha => JSON.parse(linha) as RegistroDeContencao)
  expect(registros).toHaveLength(2)
  const [primeiro, segundo] = registros as [RegistroDeContencao, RegistroDeContencao]
  expect(intervalosSeSobrepoem(primeiro, segundo), `janelas se sobrepuseram: ${JSON.stringify(registros)}`).toBe(false)
})

test('writeFileAtomic grava o conteudo final e nao deixa arquivo temporario para tras', () => {
  const alvo = join(BASE, 'e.md')
  writeFileAtomic(alvo, 'conteudo final\n')
  expect(readFileSync(alvo, 'utf8')).toBe('conteudo final\n')
  expect(existsSync(`${alvo}.tmp.${process.pid}`)).toBe(false)
})

test('writeFileAtomic sobrescreve por completo um arquivo existente', () => {
  const alvo = join(BASE, 'f.md')
  writeFileSync(alvo, 'versao velha')
  writeFileAtomic(alvo, 'versao nova')
  expect(readFileSync(alvo, 'utf8')).toBe('versao nova')
})
