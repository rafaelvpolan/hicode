import { test, expect, afterEach } from 'bun:test'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { lerEscopo, lerLinhaDeServidor, lerListaDeServidores, sondarMcp } from '../panel/server/servicos/mcp'

test('lerLinhaDeServidor reconhece servidor conectado', () => {
  expect(lerLinhaDeServidor('figma: figma-mcp - ✓ Connected')).toEqual({ nome: 'figma', estado: 'conectado' })
})

test('lerLinhaDeServidor reconhece servidor que precisa de autenticacao, mesmo tambem "conectado" na aparencia', () => {
  expect(lerLinhaDeServidor('github: gh-mcp - Needs authentication')).toEqual({ nome: 'github', estado: 'precisa-auth' })
})

test('lerLinhaDeServidor cai em "desconhecido" quando o formato da linha nao bate com nenhum padrao vocabular conhecido', () => {
  expect(lerLinhaDeServidor('customserver: pending initialization')).toEqual({ nome: 'customserver', estado: 'desconhecido' })
})

test('lerLinhaDeServidor devolve null para linha sem "nome: status" (ex.: continuacao de log)', () => {
  expect(lerLinhaDeServidor('info - continuing: some detail')).toBeNull()
  expect(lerLinhaDeServidor('linha sem separador nenhum')).toBeNull()
})

test('lerListaDeServidores filtra as linhas invalidas e preserva a ordem das validas', () => {
  const saida = [
    'Checking MCP server health...',
    'figma: figma-mcp - ✓ Connected',
    'github: gh-mcp - Needs authentication',
    '',
  ].join('\n')
  expect(lerListaDeServidores(saida)).toEqual([
    { nome: 'figma', estado: 'conectado' },
    { nome: 'github', estado: 'precisa-auth' },
  ])
})

test('lerEscopo reconhece escopo dinamico (case-insensitive) e cai para persistente em qualquer outro texto', () => {
  expect(lerEscopo('Scope: Dynamic config')).toBe('dinamico')
  expect(lerEscopo('scope: dynamic config, session only')).toBe('dinamico')
  expect(lerEscopo('Scope: User config')).toBe('persistente')
  expect(lerEscopo('')).toBe('persistente')
})

const pathOriginal = process.env.PATH
const criados: string[] = []

afterEach(() => {
  process.env.PATH = pathOriginal
  for (const d of criados.splice(0)) rmSync(d, { recursive: true, force: true })
})

function diretorioVazio(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hicode-fake-claude-vazio-'))
  criados.push(dir)
  return dir
}

function comFakeClaude(script: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'hicode-fake-claude-'))
  criados.push(dir)
  const arquivo = join(dir, 'claude')
  writeFileSync(arquivo, `#!/bin/sh\n${script}\n`)
  chmodSync(arquivo, 0o755)
  return dir
}

const TOKEN_FALSO = 'sk-fake-secret-token-abcdef123456'

test('claude ausente do PATH — sondarMcp devolve um unico status de erro, sem tentar listar servidores', async () => {
  process.env.PATH = diretorioVazio()
  const status = await sondarMcp()
  expect(status).toHaveLength(1)
  expect(status[0]?.estado).toBe('erro')
  expect(status[0]?.detalhe).toContain('claude mcp list falhou')
})

test('claude presente mas sem nenhum servidor configurado — estado atencao', async () => {
  process.env.PATH = comFakeClaude(`
if [ "$1" = "mcp" ] && [ "$2" = "list" ]; then echo ""; exit 0; fi
exit 1
`)
  const status = await sondarMcp()
  expect(status).toHaveLength(1)
  expect(status[0]?.estado).toBe('atencao')
  expect(status[0]?.detalhe).toContain('nenhum servidor MCP configurado')
})

test('sondarMcp classifica cada servidor pelo cruzamento de "mcp list" com "mcp get": conectado+dinamico, conectado+persistente, precisa-auth, conectado sem escopo confirmavel', async () => {
  process.env.PATH = comFakeClaude(`
if [ "$1" = "mcp" ] && [ "$2" = "list" ]; then
  echo "figma: figma-mcp - Connected (token ${TOKEN_FALSO})"
  echo "github: gh-mcp - Needs authentication"
  echo "outroservidor: outro-mcp - Connected"
  echo "semescopo: semescopo-mcp - Connected"
  exit 0
fi
if [ "$1" = "mcp" ] && [ "$2" = "get" ]; then
  case "$3" in
    figma) echo "Scope: Dynamic config"; exit 0 ;;
    outroservidor) echo "Scope: User config"; exit 0 ;;
  esac
  exit 1
fi
exit 1
`)
  const status = await sondarMcp()
  const por = (nome: string) => status.find(s => s.nome === `MCP: ${nome}`)

  expect(por('figma')?.estado).toBe('atencao')
  expect(por('figma')?.detalhe).toContain('escopo dinamico')

  expect(por('github')?.estado).toBe('atencao')
  expect(por('github')?.detalhe).toContain('pede autenticacao')

  expect(por('outroservidor')?.estado).toBe('ok')
  expect(por('outroservidor')?.detalhe).toContain('escopo persistente')

  expect(por('semescopo')?.estado).toBe('desconhecido')
  expect(por('semescopo')?.detalhe).toContain('nao consegui confirmar o escopo')
})

test('REGRESSAO seguranca: nenhum token/segredo da saida real do claude atravessa para o objeto de resposta', async () => {
  process.env.PATH = comFakeClaude(`
if [ "$1" = "mcp" ] && [ "$2" = "list" ]; then
  echo "figma: figma-mcp - ✓ Connected (token ${TOKEN_FALSO})"
  exit 0
fi
if [ "$1" = "mcp" ] && [ "$2" = "get" ]; then
  echo "Scope: User config (token ${TOKEN_FALSO})"
  exit 0
fi
exit 1
`)
  const status = await sondarMcp()
  expect(JSON.stringify(status)).not.toContain(TOKEN_FALSO)
})
