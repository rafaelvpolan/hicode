import { test, expect, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { resolverEntrypoint } = await import('../panel/server/motor/cli')

const pathOriginal = process.env.PATH
const hiiHomeOriginal = process.env.HII_HOME
const criados: string[] = []

afterEach(() => {
  process.env.PATH = pathOriginal
  if (hiiHomeOriginal === undefined) delete process.env.HII_HOME
  else process.env.HII_HOME = hiiHomeOriginal
  for (const d of criados.splice(0)) rmSync(d, { recursive: true, force: true })
})

function diretorioVazio(prefixo: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefixo))
  criados.push(dir)
  return dir
}

function pathComBinarioHii(): string {
  const dir = diretorioVazio('hicode-entrypoint-bin-')
  writeFileSync(join(dir, 'hii'), '#!/bin/sh\nexit 0\n')
  return dir
}

test('binario "hii" presente no PATH resolve por path, com args vazios, sem tocar o fallback', () => {
  process.env.PATH = pathComBinarioHii()
  process.env.HII_HOME = diretorioVazio('hicode-entrypoint-home-')
  writeFileSync(join(process.env.HII_HOME, 'runner.ts'), '')

  const resolvido = resolverEntrypoint()
  expect(resolvido).not.toBeNull()
  expect(resolvido?.origem).toBe('path')
  expect(resolvido?.args).toEqual([])
  expect(resolvido?.runtime.endsWith('/hii')).toBe(true)
})

test('binario ausente do PATH, mas runner.ts existe no HII_HOME, cai no fallback bun+runner.ts', () => {
  process.env.PATH = diretorioVazio('hicode-entrypoint-empty-')
  const home = diretorioVazio('hicode-entrypoint-home2-')
  writeFileSync(join(home, 'runner.ts'), '')
  process.env.HII_HOME = home

  const resolvido = resolverEntrypoint()
  expect(resolvido).not.toBeNull()
  expect(resolvido?.origem).toBe('hii-home')
  expect(resolvido?.runtime).toBe('bun')
  expect(resolvido?.args).toEqual([join(home, 'runner.ts')])
})

test('nem binario no PATH nem runner.ts no HII_HOME — resolverEntrypoint devolve null, motor de verdade ausente', () => {
  process.env.PATH = diretorioVazio('hicode-entrypoint-empty2-')
  process.env.HII_HOME = diretorioVazio('hicode-entrypoint-home3-')

  expect(resolverEntrypoint()).toBeNull()
})

test('binario "hii" no PATH tem prioridade sobre runner.ts no HII_HOME quando os dois existem', () => {
  process.env.PATH = pathComBinarioHii()
  const home = diretorioVazio('hicode-entrypoint-home4-')
  writeFileSync(join(home, 'runner.ts'), '')
  process.env.HII_HOME = home

  expect(resolverEntrypoint()?.origem).toBe('path')
})
