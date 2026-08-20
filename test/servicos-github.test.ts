import { test, expect, afterEach } from 'bun:test'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { sondarGithub } from '../panel/server/servicos/github'

const pathOriginal = process.env.PATH
const criados: string[] = []

afterEach(() => {
  process.env.PATH = pathOriginal
  for (const d of criados.splice(0)) rmSync(d, { recursive: true, force: true })
})

function diretorioVazio(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hicode-fake-gh-vazio-'))
  criados.push(dir)
  return dir
}

function comFakeGh(script: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'hicode-fake-gh-'))
  criados.push(dir)
  const arquivo = join(dir, 'gh')
  writeFileSync(arquivo, `#!/bin/sh\n${script}\n`)
  chmodSync(arquivo, 0o755)
  return dir
}

const TOKEN_FALSO = 'ghp_FAKESECRETTOKENVALUE1234567890'

test('gh ausente do PATH — estado erro, motivo explicito, sem tentar autenticacao', async () => {
  process.env.PATH = diretorioVazio()
  const status = await sondarGithub()
  expect(status.nome).toBe('GitHub')
  expect(status.estado).toBe('erro')
  expect(status.detalhe).toContain('nao encontrado no PATH')
})

test('gh instalado mas nao autenticado — estado erro, com instrucao de como resolver', async () => {
  process.env.PATH = comFakeGh(`
case "$1" in
  --version) echo "gh version 2.40.0 (fake)"; exit 0 ;;
  auth) echo "not logged in. Token: ${TOKEN_FALSO}" 1>&2; exit 1 ;;
esac
exit 1
`)
  const status = await sondarGithub()
  expect(status.estado).toBe('erro')
  expect(status.detalhe).toContain('nao autenticado')
  expect(status.comoResolver).toContain('gh auth login')
})

test('gh instalado e autenticado — estado ok', async () => {
  process.env.PATH = comFakeGh(`
case "$1" in
  --version) echo "gh version 2.40.0 (fake)"; exit 0 ;;
  auth) echo "Logged in to github.com as testudo-bot (Token: ${TOKEN_FALSO})" 1>&2; exit 0 ;;
esac
exit 1
`)
  const status = await sondarGithub()
  expect(status.estado).toBe('ok')
  expect(status.detalhe).toBe('autenticado')
})

test('REGRESSAO seguranca: nenhum trecho da saida real do gh (nem token, nem stdout/stderr bruto) atravessa para o objeto de resposta', async () => {
  process.env.PATH = comFakeGh(`
case "$1" in
  --version) echo "gh version 2.40.0 (fake)"; exit 0 ;;
  auth) echo "Logged in to github.com as testudo-bot (Token: ${TOKEN_FALSO})" 1>&2; exit 0 ;;
esac
exit 1
`)
  const status = await sondarGithub()
  const serializado = JSON.stringify(status)
  expect(serializado).not.toContain(TOKEN_FALSO)
  expect(serializado).not.toContain('testudo-bot')
})
