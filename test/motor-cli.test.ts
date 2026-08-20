import { test, expect, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

process.env.HICODE_CARDS_DIR = mkdtempSync(join(tmpdir(), 'hicode-motor-cli-cards-'))

const { dispatch } = await import('../panel/server/motor/cli')

const criados: string[] = [process.env.HICODE_CARDS_DIR]
const pathOriginal = process.env.PATH
const hiiHomeOriginal = process.env.HII_HOME

afterEach(() => {
  process.env.PATH = pathOriginal
  if (hiiHomeOriginal === undefined) delete process.env.HII_HOME
  else process.env.HII_HOME = hiiHomeOriginal
  for (const d of criados.splice(0)) rmSync(d, { recursive: true, force: true })
})

function somenteBunNoPath(): void {
  const binDir = mkdtempSync(join(tmpdir(), 'hicode-motor-cli-bin-'))
  criados.push(binDir)
  symlinkSync(process.execPath, join(binDir, 'bun'))
  process.env.PATH = binDir
}

function hiiHomeComRunner(conteudo: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'hicode-motor-cli-home-'))
  criados.push(dir)
  writeFileSync(join(dir, 'runner.ts'), conteudo)
  process.env.HII_HOME = dir
  return dir
}

test('rodada6: argumento fora da gramatica real nao sobe o daemon — allowlist rejeita antes de resolver entrypoint', async () => {
  const resultado = await dispatch(['--nao-existe'])
  expect(resultado.ok).toBe(false)
  expect(resultado.stderr).toContain('cairia no daemon completo do motor')
})

test('rodada6: dispatch([]) cairia no ramo daemon do runner.ts — allowlist tambem rejeita args vazios', async () => {
  const resultado = await dispatch([])
  expect(resultado.ok).toBe(false)
  expect(resultado.stderr).toContain('cairia no daemon completo do motor')
})

test('rodada6: --status --watch nao e pontual (loop infinito) — cai fora da allowlist', async () => {
  const resultado = await dispatch(['--status', '--watch'])
  expect(resultado.ok).toBe(false)
  expect(resultado.stderr).toContain('cairia no daemon completo do motor')
})

test('rodada6: --once faz parte da gramatica real de comando pontual — passa da allowlist quando o chamador escolhe o timeoutMs', async () => {
  somenteBunNoPath()
  hiiHomeComRunner('process.exit(0)\n')
  const resultado = await dispatch(['--once'], { timeoutMs: 5000 })
  expect(resultado.stderr).not.toContain('cairia no daemon completo do motor')
  expect(resultado.ok).toBe(true)
})

test('rodada-costura: --once sem timeoutMs explicito e recusado — nao existe default seguro para o pipeline inteiro', async () => {
  somenteBunNoPath()
  hiiHomeComRunner('process.exit(0)\n')
  const resultado = await dispatch(['--once'])
  expect(resultado.ok).toBe(false)
  expect(resultado.exitCode).toBeNull()
  expect(resultado.stderr).toContain('timeoutMs explicitamente')
})

test('rodada-costura: comando curto (--status) continua com default de 30s sem exigir timeoutMs', async () => {
  somenteBunNoPath()
  hiiHomeComRunner('process.exit(0)\n')
  const resultado = await dispatch(['--status'])
  expect(resultado.stderr).not.toContain('timeoutMs explicitamente')
  expect(resultado.ok).toBe(true)
})

test('merge nunca e argumento que o alvo aceita — guarda dedicada continua valendo antes da allowlist', async () => {
  const resultado = await dispatch(['merge'])
  expect(resultado.ok).toBe(false)
  expect(resultado.stderr).toContain('merge e sempre humano')
})

test('dispatch devolve erro explicito quando o motor nao existe nem no PATH nem no HII_HOME', async () => {
  const binDir = mkdtempSync(join(tmpdir(), 'hicode-motor-cli-sem-bin-'))
  criados.push(binDir)
  process.env.PATH = binDir
  process.env.HII_HOME = mkdtempSync(join(tmpdir(), 'hicode-motor-cli-sem-home-'))
  criados.push(process.env.HII_HOME)

  const resultado = await dispatch(['--status'])
  expect(resultado.ok).toBe(false)
  expect(resultado.exitCode).toBeNull()
  expect(resultado.stderr).toContain('motor nao encontrado')
})

test('dispatch resolve ok=false, sem lancar, quando o runtime resolvido nao pode ser spawnado de verdade', async () => {
  const binDir = mkdtempSync(join(tmpdir(), 'hicode-motor-cli-sem-bun-'))
  criados.push(binDir)
  process.env.PATH = binDir
  hiiHomeComRunner('process.exit(0)\n')

  const resultado = await dispatch(['--status'])
  expect(resultado.ok).toBe(false)
  expect(resultado.exitCode).toBeNull()
  expect(resultado.stderr.length).toBeGreaterThan(0)
})

test('rodada6: SIGTERM ignorado pela IA escala para SIGKILL — a Promise nao fica pendurada esperando para sempre', async () => {
  somenteBunNoPath()
  hiiHomeComRunner("process.on('SIGTERM', () => {})\nsetInterval(() => {}, 1000)\n")
  const inicio = Date.now()
  const resultado = await dispatch(['--once'], { timeoutMs: 30, sigkillGraceMs: 30 })
  const duracaoMs = Date.now() - inicio
  expect(resultado.timedOut).toBe(true)
  expect(resultado.ok).toBe(false)
  expect(duracaoMs).toBeLessThan(3000)
}, 10000)
