import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Card } from '../lib/card'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-custo-cego-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
mkdirSync(process.env.HICODE_CARDS_DIR, { recursive: true })

const RESPOSTA = join(BASE, 'resposta.jsonl')
const binDir = join(BASE, 'bin')
mkdirSync(binDir, { recursive: true })
writeFileSync(join(binDir, 'codex'), `#!/usr/bin/env bash\ncat ${RESPOSTA}\n`)
chmodSync(join(binDir, 'codex'), 0o755)

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

const origem = join(BASE, 'origem.git')
const semente = join(BASE, 'semente')
const clone = join(BASE, 'clone')
execFileSync('git', ['init', '-q', '--bare', origem])
mkdirSync(semente, { recursive: true })
git(semente, ['init', '-q', '.'])
git(semente, ['config', 'user.email', 't@t'])
git(semente, ['config', 'user.name', 't'])
writeFileSync(join(semente, 'a.txt'), 'um\n')
git(semente, ['add', '-A'])
git(semente, ['commit', '-qm', 'primeiro'])
git(semente, ['branch', '-M', 'main'])
git(semente, ['remote', 'add', 'origin', origem])
git(semente, ['push', '-q', '-u', 'origin', 'main'])
execFileSync('git', ['--git-dir', origem, 'symbolic-ref', 'HEAD', 'refs/heads/main'])
execFileSync('git', ['clone', '-q', origem, clone])
git(clone, ['config', 'user.email', 't@t'])
git(clone, ['config', 'user.name', 't'])
writeFileSync(join(clone, 'a.txt'), 'um\ndois\n')
git(clone, ['add', '-A'])
git(clone, ['commit', '-qm', 'mudanca do card'])

const { createCard, readCard } = await import('../lib/runner/card-store')
const { clarify } = await import('../lib/runner/clarify')
const { evaluate } = await import('../lib/runner/eval')
const { idear } = await import('../lib/runner/ideate-run')
const { runCodefoxGate } = await import('../lib/runner/codefox-gate')
const { runStep } = await import('../lib/runner/agent')

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

function responder(texto: string): void {
  writeFileSync(RESPOSTA, `${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: texto } })}\n${JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } })}\n`)
}

async function comProvedorQueNaoReportaGasto<T>(texto: string, fn: () => Promise<T>): Promise<T> {
  const provedorAntes = process.env.HICODE_AI_PROVIDER
  const pathAntes = process.env.PATH ?? ''
  responder(texto)
  process.env.HICODE_AI_PROVIDER = 'codex'
  process.env.PATH = `${binDir}:${pathAntes}`
  try {
    return await fn()
  } finally {
    if (provedorAntes === undefined) delete process.env.HICODE_AI_PROVIDER
    else process.env.HICODE_AI_PROVIDER = provedorAntes
    process.env.PATH = pathAntes
  }
}

function cardNovo(): string {
  return createCard({ title: 'ajuste no rodape', status: 'EXECUTING', repo: 'org/repo', cost_usd: '0.0000' }, '## Objetivo\nmudar o rodape\n')
}

function marcaDoCard(id: string): string {
  return readCard(id)?.fm.cost_unverified ?? ''
}

function cardDe(id: string): Card {
  const c = readCard(id)
  if (!c) throw new Error(`card ${id} nao encontrado`)
  return c
}

test('REGRESSAO: clarify com provedor que nao reporta gasto carimba cost_unverified no card', async () => {
  const id = cardNovo()

  await comProvedorQueNaoReportaGasto('{"questions":[]}', () => clarify(cardDe(id)))

  expect(marcaDoCard(id)).toBe('codex')
})

test('REGRESSAO: eval com provedor que nao reporta gasto carimba cost_unverified no card', async () => {
  const id = cardNovo()

  const e = await comProvedorQueNaoReportaGasto('{"score":4,"meets":true,"notes":"ok"}', () => evaluate(cardDe(id), clone, 'main'))

  expect(e.score).toBe(4)
  expect(marcaDoCard(id)).toBe('codex')
})

test('REGRESSAO: ideacao com provedor que nao reporta gasto carimba cost_unverified no card', async () => {
  const id = cardNovo()

  await comProvedorQueNaoReportaGasto('sem ideias parseaveis', () => idear('mudar o rodape', id))

  expect(marcaDoCard(id)).toBe('codex')
})

test('REGRESSAO: gate codefox com provedor que nao reporta gasto carimba cost_unverified e nao afirma custo medido', async () => {
  const id = cardNovo()

  const gate = await comProvedorQueNaoReportaGasto('{"verdict":"APPROVED","reason":"ok","questions":["leu o diff?"]}', () => runCodefoxGate(clone, 'main', 'mudar o rodape', id))

  expect(gate.verdict).toBe('APPROVED')
  expect(gate.costMeasured).toBe(false)
  expect(marcaDoCard(id)).toBe('codex')
})

test('step de polimento com provedor que nao reporta gasto carimba o card e devolve costMeasured false', async () => {
  const id = cardNovo()

  const r = await comProvedorQueNaoReportaGasto('ajustei', () => runStep(clone, 'rufus', 'melhore X', id))

  expect(r.ok).toBe(true)
  expect(r.costMeasured).toBe(false)
  expect(marcaDoCard(id)).toBe('codex')
})
