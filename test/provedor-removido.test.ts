import { test, expect, afterAll } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Card } from '../lib/card'
import { warnProviderConfig } from '../lib/ai/provider-config'
import { createCard, readCard } from '../lib/runner/card-store'

const REPO = join(import.meta.dir, '..')
const BASE = mkdtempSync(join(tmpdir(), 'hicode-provedor-removido-'))
const CARDS = join(BASE, 'cards')
const CARDS_VAZIO = join(BASE, 'cards-vazio')
const REPOS = join(BASE, 'repos.json')
const WT = join(BASE, 'wt')
const BIN = join(BASE, 'bin')
const RESPOSTA = join(BASE, 'resposta.jsonl')
const IMPLEMENTA = join(BASE, 'implementa.ts')

mkdirSync(CARDS, { recursive: true })
mkdirSync(CARDS_VAZIO, { recursive: true })
mkdirSync(WT, { recursive: true })
mkdirSync(BIN, { recursive: true })
writeFileSync(join(BIN, 'codex'), `#!/usr/bin/env bash\ncat ${RESPOSTA}\n`)
chmodSync(join(BIN, 'codex'), 0o755)
writeFileSync(RESPOSTA, [
  JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'implementei o rodape' } }),
  JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }),
  '',
].join('\n'))
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

function comEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const anterior = new Map<string, string | undefined>()
  for (const [k, v] of Object.entries(vars)) {
    anterior.set(k, process.env[k])
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return fn()
  } finally {
    for (const [k, v] of anterior) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

const SEM_PROVEDOR: Record<string, string | undefined> = {
  HICODE_AI_PROVIDER: undefined,
  HICODE_IMPLEMENT_PROVIDER: undefined,
  HICODE_VERIFY_PROVIDER: undefined,
  HICODE_GATE_PROVIDER: undefined,
  HICODE_STEP_PROVIDER: undefined,
  HICODE_IMPLEMENT_QUOTA_FALLBACK_PROVIDER: undefined,
  HICODE_VERIFY_QUOTA_FALLBACK_PROVIDER: undefined,
  HICODE_GATE_QUOTA_FALLBACK_PROVIDER: undefined,
  HICODE_STEP_QUOTA_FALLBACK_PROVIDER: undefined,
}

function avisos(vars: Record<string, string | undefined>): string {
  return comEnv(vars, () => {
    const linhas: string[] = []
    warnProviderConfig(l => { linhas.push(l) })
    return linhas.join('')
  })
}

function comCards<T>(fn: () => T): T {
  return comEnv({ HICODE_CARDS_DIR: CARDS, HICODE_REPOS_FILE: REPOS }, fn)
}

function cardComOverride(title: string, objetivo: string): string {
  return comCards(() => createCard({ title, status: 'EXECUTING', repo: '', provider_override_implement: 'opencode' }, `## Objetivo\n${objetivo}\n`))
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

function implementarComCodex(id: string): SaidaImplement {
  const r = spawnSync('bun', [IMPLEMENTA, id, WT], {
    cwd: REPO,
    env: {
      ...process.env,
      PATH: `${BIN}:${process.env.PATH ?? ''}`,
      HICODE_CARDS_DIR: CARDS,
      HICODE_REPOS_FILE: REPOS,
      HICODE_PROJECT_MEMORY: 'off',
      HICODE_AI_PROVIDER: 'codex',
      HICODE_IMPLEMENT_PROVIDER: 'codex',
    },
    encoding: 'utf8',
    timeout: 40000,
  })
  if (r.status !== 0) throw new Error(`implement falhou (${r.status}): ${String(r.stderr)}`)
  return JSON.parse(String(r.stdout).trim()) as SaidaImplement
}

function ocorrencias(texto: string, alvo: string): number {
  return texto.split(alvo).length - 1
}

test('REGRESSAO: HICODE_IMPLEMENT_PROVIDER=opencode (o que o README recomendava) avisa em vez de trocar calado', () => {
  const saida = avisos({ ...SEM_PROVEDOR, HICODE_AI_PROVIDER: 'codex', HICODE_IMPLEMENT_PROVIDER: 'opencode' })

  expect(saida).toContain('"opencode"')
  expect(saida).toContain('HICODE_IMPLEMENT_PROVIDER')
  expect(saida).toContain('usando codex')
  expect(saida).toContain('claude, codex, ollama')
})

test('provedor global removido avisa que o default assumiu', () => {
  const saida = avisos({ ...SEM_PROVEDOR, HICODE_AI_PROVIDER: 'opencode' })

  expect(saida).toContain('HICODE_AI_PROVIDER')
  expect(saida).toContain('usando claude')
})

test('fallback de cota com provedor removido avisa que nao havera troca', () => {
  const saida = avisos({ ...SEM_PROVEDOR, HICODE_IMPLEMENT_QUOTA_FALLBACK_PROVIDER: 'opencode' })

  expect(saida).toContain('HICODE_IMPLEMENT_QUOTA_FALLBACK_PROVIDER')
  expect(saida).toContain('sem troca de provedor por cota')
})

test('configuracao valida nao gera aviso nenhum (sem alarme falso)', () => {
  expect(avisos({ ...SEM_PROVEDOR, HICODE_AI_PROVIDER: 'claude', HICODE_STEP_PROVIDER: 'codex' })).toBe('')
  expect(avisos(SEM_PROVEDOR)).toBe('')
})

test('REGRESSAO: card com provider_override_implement removido registra a substituicao no proprio card', () => {
  const id = cardComOverride('ajuste no rodape', 'mudar o rodape')

  const r = implementarComCodex(id)

  expect(r.ok).toBe(true)
  expect(r.provider).toBe('codex')
  const card = cardDe(id)
  expect(card.fm.provider_unknown).toBe('opencode')
  expect(card.body).toContain('provedor "opencode" pedido no card nao existe')
  expect(card.body).toContain('implementando com codex')
}, 60000)

test('a substituicao e registrada uma vez, nao a cada reexecucao do card', () => {
  const id = cardComOverride('outro ajuste', 'mudar o topo')

  implementarComCodex(id)
  implementarComCodex(id)

  expect(ocorrencias(cardDe(id).body, 'provedor "opencode" pedido no card nao existe')).toBe(1)
}, 60000)

test('o motor avisa no arranque, antes de gastar dinheiro com o provedor errado', () => {
  const r = spawnSync('bun', [join(REPO, 'runner.ts'), '--once'], {
    cwd: REPO,
    env: {
      ...process.env,
      HICODE_CARDS_DIR: CARDS_VAZIO,
      HICODE_REPOS_FILE: REPOS,
      HICODE_RUNNER_LOCK: join(BASE, 'arranque.lock'),
      HICODE_RUNNER_PIDFILE: join(BASE, 'arranque.pid'),
      HICODE_AI_PROVIDER: 'claude',
      HICODE_IMPLEMENT_PROVIDER: 'opencode',
    },
    encoding: 'utf8',
    timeout: 40000,
  })

  expect(r.status).toBe(0)
  expect(String(r.stderr)).toContain('provedor "opencode" configurado em HICODE_IMPLEMENT_PROVIDER')
  expect(String(r.stderr)).toContain('usando claude')
}, 60000)
