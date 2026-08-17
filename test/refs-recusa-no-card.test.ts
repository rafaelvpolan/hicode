import { test, expect, afterAll } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Card } from '../lib/card'
import { createCard, readCard } from '../lib/runner/card-store'

const REPO = join(import.meta.dir, '..')
const BASE = mkdtempSync(join(tmpdir(), 'hicode-ref-recusada-'))
const CARDS = join(BASE, 'cards')
const REPOS = join(BASE, 'repos.json')
const WT = join(BASE, 'wt')
const BIN = join(BASE, 'bin')
const IMPLEMENTA = join(BASE, 'implementa.ts')

const METADADOS = 'http://169.254.169.254/latest/meta-data/iam/security-credentials/'
const SUMIDO = 'https://nao-existe-mesmo.invalid/ref.png'
const SEM_ESQUEMA = 'www.figma.com/mockup.png'
const MAIUSCULA = 'HTTPS://CDN.NAO-EXISTE-MESMO.INVALID/logo.png'
const IP_DE_TESTE = '192.0.2.7'
const CURL_REAL = Bun.which('curl') ?? '/usr/bin/curl'

mkdirSync(join(CARDS, 'refs'), { recursive: true })
mkdirSync(WT, { recursive: true })
mkdirSync(BIN, { recursive: true })
writeFileSync(join(BIN, 'claude'), [
  '#!/usr/bin/env bash',
  `cat <<'JSON'`,
  JSON.stringify({ type: 'result', subtype: 'success', total_cost_usd: 0.01, result: 'limpio ajustou o rodape', is_error: false, usage: { input_tokens: 10, output_tokens: 5 } }),
  'JSON',
  '',
].join('\n'))
chmodSync(join(BIN, 'claude'), 0o755)
writeFileSync(join(BIN, 'curl'), [
  '#!/usr/bin/env bash',
  'args=()',
  `for a in "$@"; do args+=("\${a//${IP_DE_TESTE}/127.0.0.1}"); done`,
  `exec ${CURL_REAL} "\${args[@]}"`,
  '',
].join('\n'))
chmodSync(join(BIN, 'curl'), 0o755)
writeFileSync(IMPLEMENTA, [
  `import { implement } from ${JSON.stringify(join(REPO, 'lib', 'runner', 'agent'))}`,
  `import { readCard } from ${JSON.stringify(join(REPO, 'lib', 'runner', 'card-store'))}`,
  'const card = readCard(process.argv[2] ?? String())',
  'if (!card) { process.stderr.write("card nao encontrado\\n"); process.exit(2) }',
  'const r = await implement(card, process.argv[3] ?? String())',
  'process.stdout.write(`${JSON.stringify({ ok: r.ok, provider: r.provider })}\\n`)',
  '',
].join('\n'))

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

const AMBIENTE: Record<string, string> = {
  HICODE_CARDS_DIR: CARDS,
  HICODE_REPOS_FILE: REPOS,
  HICODE_PROJECT_MEMORY: 'off',
  HICODE_AI_PROVIDER: 'claude',
  HICODE_IMPLEMENT_PROVIDER: 'claude',
}

function comCards<T>(fn: () => T): T {
  const anterior = { cards: process.env.HICODE_CARDS_DIR, repos: process.env.HICODE_REPOS_FILE }
  process.env.HICODE_CARDS_DIR = CARDS
  process.env.HICODE_REPOS_FILE = REPOS
  try {
    return fn()
  } finally {
    if (anterior.cards === undefined) delete process.env.HICODE_CARDS_DIR
    else process.env.HICODE_CARDS_DIR = anterior.cards
    if (anterior.repos === undefined) delete process.env.HICODE_REPOS_FILE
    else process.env.HICODE_REPOS_FILE = anterior.repos
  }
}

function cardComRefs(title: string, fontes: string[]): string {
  const id = comCards(() => createCard({ title, status: 'EXECUTING', repo: '' }, `## Objetivo\n${title}\n`))
  writeFileSync(join(CARDS, 'refs', `${id}.json`), JSON.stringify(fontes))
  return id
}

function refLocal(id: string): string {
  const dir = join(CARDS, 'refs', id)
  mkdirSync(dir, { recursive: true })
  const caminho = join(dir, 'mockup.png')
  writeFileSync(caminho, 'PNGDATA')
  return caminho
}

function cardDe(id: string): Card {
  const c = comCards(() => readCard(id))
  if (!c) throw new Error(`card ${id} nao encontrado`)
  return c
}

interface SaidaImplement {
  ok: boolean
  provider: string
}

async function implementar(id: string): Promise<SaidaImplement> {
  const p = Bun.spawn(['bun', IMPLEMENTA, id, WT], {
    cwd: REPO,
    env: { ...process.env, PATH: `${BIN}:${process.env.PATH ?? ''}`, ...AMBIENTE },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 60000,
  })
  const [saida, erro] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()])
  await p.exited
  if (p.exitCode !== 0) throw new Error(`implement falhou (${p.exitCode}): ${erro}`)
  return JSON.parse(saida.trim()) as SaidaImplement
}

function servidorLocal(status: number, corpo: string | null): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (): Response => new Response(corpo, { status, headers: { 'content-type': 'image/png' } }),
  })
}

test('REGRESSAO: SSRF bloqueado nao some na fronteira — o card diz qual referencia foi recusada e por que', async () => {
  const id = cardComRefs('trocar o hero da home', [METADADOS])

  const r = await implementar(id)

  expect(r.ok).toBe(true)
  expect(r.provider).toBe('claude')
  const body = cardDe(id).body
  expect(body).toContain('referencia recusada')
  expect(body).toContain('host-bloqueado')
  expect(body).toContain('169.254.169.254')
  expect(body).toContain('implementando sem ela')
}, 90000)

test('REGRESSAO: recusa transitoria por DNS tambem vira linha no card, com o motivo tipado', async () => {
  const id = cardComRefs('ajustar o rodape', [SUMIDO])

  expect((await implementar(id)).ok).toBe(true)

  const body = cardDe(id).body
  expect(body).toContain('referencia recusada')
  expect(body).toContain('dns-falhou')
  expect(body).toContain('nao-existe-mesmo.invalid')
}, 90000)

test('uma linha por fonte recusada: a legitima passa e nao gera ruido', async () => {
  const id = cardComRefs('refazer o menu', [])
  const local = refLocal(id)
  writeFileSync(join(CARDS, 'refs', `${id}.json`), JSON.stringify([METADADOS, local, SUMIDO]))

  expect((await implementar(id)).ok).toBe(true)

  const body = cardDe(id).body
  expect(body.split('referencia recusada').length - 1).toBe(2)
  expect(body).not.toContain('mockup.png (')
}, 90000)

test('REGRESSAO: fonte sem esquema nao some antes do card — o corpo diz que falta o http(s)', async () => {
  const id = cardComRefs('trocar o mockup do hero', [SEM_ESQUEMA])

  expect((await implementar(id)).ok).toBe(true)

  const body = cardDe(id).body
  expect(body).toContain('referencia recusada')
  expect(body).toContain('fonte-invalida')
  expect(body).toContain(SEM_ESQUEMA)
  expect(body).toContain('https://')
}, 90000)

test('REGRESSAO: fonte com esquema em MAIUSCULA vira recusa no card em vez de sumir na fronteira', async () => {
  const id = cardComRefs('ajustar o banner', [MAIUSCULA])

  expect((await implementar(id)).ok).toBe(true)

  const body = cardDe(id).body
  expect(body).toContain('referencia recusada')
  expect(body).toContain('dns-falhou')
  expect(body).toContain(MAIUSCULA)
  expect(body).toContain('cdn.nao-existe-mesmo.invalid')
}, 90000)

test('card sem fonte recusada nao ganha linha nenhuma (sem alarme falso)', async () => {
  const id = cardComRefs('mexer no cabecalho', [])
  writeFileSync(join(CARDS, 'refs', `${id}.json`), JSON.stringify([refLocal(id)]))

  expect((await implementar(id)).ok).toBe(true)

  expect(cardDe(id).body).not.toContain('referencia recusada')
}, 90000)

test('REGRESSAO: 404 do servidor da referencia chega ao card como resposta-de-erro, nao vira imagem', async () => {
  const s = servidorLocal(404, '<html>404 Not Found — nginx</html>')
  try {
    const fonte = `http://${IP_DE_TESTE}:${s.port}/ref.png`
    const id = cardComRefs('trocar a arte do hero', [fonte])

    expect((await implementar(id)).ok).toBe(true)

    const body = cardDe(id).body
    expect(body).toContain('referencia recusada')
    expect(body).toContain('resposta-de-erro')
    expect(body).toContain('HTTP 404')
    expect(body).toContain(fonte)
    expect(body).toContain('implementando sem ela')
  } finally {
    s.stop(true)
  }
}, 90000)

test('REGRESSAO: 200 com corpo de 0 bytes chega ao card como resposta-vazia, com motivo proprio', async () => {
  const s = servidorLocal(200, null)
  try {
    const fonte = `http://${IP_DE_TESTE}:${s.port}/ref.png`
    const id = cardComRefs('trocar o mockup do menu', [fonte])

    expect((await implementar(id)).ok).toBe(true)

    const body = cardDe(id).body
    expect(body).toContain('referencia recusada')
    expect(body).toContain('resposta-vazia')
    expect(body).toContain('0 bytes')
    expect(body).toContain(fonte)
    expect(body).not.toContain('resposta-de-erro')
  } finally {
    s.stop(true)
  }
}, 90000)
