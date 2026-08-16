import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Run } from '../lib/card'
import type { AgentRequest } from '../lib/ai/types'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-custo-medido-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
mkdirSync(process.env.HICODE_CARDS_DIR, { recursive: true })

const binDir = join(BASE, 'bin')
mkdirSync(binDir, { recursive: true })

function fakeBin(nome: string, script: string): void {
  const caminho = join(binDir, nome)
  writeFileSync(caminho, script)
  chmodSync(caminho, 0o755)
}

fakeBin('codex', `#!/usr/bin/env bash
cat <<'FIM'
{"type":"item.completed","item":{"type":"agent_message","text":"apliquei a mudanca"}}
{"type":"turn.completed","usage":{"input_tokens":1200,"cached_input_tokens":300,"output_tokens":450}}
FIM
`)

fakeBin('curl', `#!/usr/bin/env bash
echo '{"response":"resposta gerada localmente","prompt_eval_count":800,"eval_count":260}'
`)

const pathOriginal = process.env.PATH ?? ''
process.env.PATH = `${binDir}:${pathOriginal}`

const { CodexProvider } = await import('../lib/ai/adapters/codex')
const { OllamaProvider } = await import('../lib/ai/adapters/ollama')
const { writeRun, updateRunSteps } = await import('../lib/runner/runs')
const { createCard, readCard } = await import('../lib/runner/card-store')
const { markCostUnverified, warnBudgetWithoutGuarantee } = await import('../lib/runner/cost-trust')

afterAll(() => {
  process.env.PATH = pathOriginal
  rmSync(BASE, { recursive: true, force: true })
})

function pedido(): AgentRequest {
  return { prompt: 'faca algo', cwd: BASE, dirs: [BASE], mode: 'edit', useAgents: false, timeoutMs: 30000 }
}

test('ollama: custo zero e uma MEDICAO (roda local) e os tokens vem da resposta', async () => {
  const res = await new OllamaProvider().run(pedido())
  expect(res.cost).toBe(0)
  expect(res.costMeasured).toBe(true)
  expect(res.usage.tokens_in).toBe(800)
  expect(res.usage.tokens_out).toBe(260)
})

test('REGRESSAO: ollama atras de endpoint remoto NAO afirma custo medido (o zero deixa de ser garantia)', async () => {
  process.env.HICODE_OLLAMA_URL = 'https://gateway-pago.exemplo.com'
  try {
    const res = await new OllamaProvider().run(pedido())
    expect(res.cost).toBe(0)
    expect(res.costMeasured).toBe(false)
  } finally {
    delete process.env.HICODE_OLLAMA_URL
  }
})

test('ollama servido na rede privada continua sendo zero MEDIDO', async () => {
  process.env.HICODE_OLLAMA_URL = 'http://192.168.1.50:11434'
  try {
    expect((await new OllamaProvider().run(pedido())).costMeasured).toBe(true)
  } finally {
    delete process.env.HICODE_OLLAMA_URL
  }
})

test('codex: o CLI nao emite custo — o adaptador nao afirma zero, declara NAO medido', async () => {
  const res = await new CodexProvider().run(pedido())
  expect(res.costMeasured).toBe(false)
  expect(res.ok).toBe(true)
})

test('codex: o que o CLI emite (tokens) e preservado mesmo sem custo medido', async () => {
  const res = await new CodexProvider().run(pedido())
  expect(res.usage.tokens_in).toBe(1200)
  expect(res.usage.tokens_out).toBe(450)
  expect(res.usage.tokens_cache_read).toBe(300)
})

test('o zero do codex e o zero do ollama sao numericamente iguais e semanticamente opostos', async () => {
  const local = await new OllamaProvider().run(pedido())
  const cego = await new CodexProvider().run(pedido())
  expect(local.cost).toBe(cego.cost)
  expect(local.costMeasured).not.toBe(cego.costMeasured)
})

function runGravado(id: string): Run {
  const dir = join(process.env.HICODE_CARDS_DIR ?? '', 'runs')
  const nome = readdirSync(dir).filter(f => f.startsWith(`${id}-`)).sort().pop() ?? ''
  return JSON.parse(readFileSync(join(dir, nome), 'utf8')) as Run
}

test('writeRun preserva a evidencia: custo nao medido nao vira medido no disco', () => {
  writeRun('901', { ok: true, cost: '0.0000', costMeasured: false, provider: 'codex', model: 'gpt' })
  writeRun('902', { ok: true, cost: '0.0000', costMeasured: true, provider: 'ollama', model: 'llama3.1' })
  expect(runGravado('901').cost_measured).toBe(false)
  expect(runGravado('902').cost_measured).toBe(true)
})

test('writeRun de run antigo (sem o campo) nao inventa medicao', () => {
  writeRun('903', { ok: true, cost: '0.5000', provider: 'claude', model: 'opus' })
  expect(runGravado('903').cost_measured).toBe(false)
})

test('REGRESSAO: passo de polimento nao medido rebaixa o cost_measured do run que o implement mediu', () => {
  writeRun('904', { ok: true, cost: '0.5000', costMeasured: true, provider: 'claude', model: 'opus' })
  const total = updateRunSteps('904', { Arquitetura: { time: 30, cost: 0, tokens: 900, costMeasured: false } })
  expect(total.cost).toBe('0.5000')
  expect(runGravado('904').cost_measured).toBe(false)
})

test('passos medidos preservam a medicao do run e somam ao custo', () => {
  writeRun('905', { ok: true, cost: '0.5000', costMeasured: true, provider: 'claude', model: 'opus' })
  updateRunSteps('905', { Arquitetura: { time: 30, cost: 0.25, tokens: 900, costMeasured: true } })
  expect(runGravado('905').cost_measured).toBe(true)
  expect(runGravado('905').cost_usd).toBe('0.7500')
})

test('passo sem declaracao de medicao (custo real zero, sem IA) nao rebaixa nada', () => {
  writeRun('906', { ok: true, cost: '0.5000', costMeasured: true, provider: 'claude', model: 'opus' })
  updateRunSteps('906', { Testes: { time: 12, cost: 0, tokens: 0 } })
  expect(runGravado('906').cost_measured).toBe(true)
})

function cardComCusto(custo: string): string {
  return createCard({
    title: 'tarefa qualquer',
    status: 'EXECUTING',
    repo: 'org/repo',
    cost_usd: custo,
  }, '## Objetivo\nfazer algo\n')
}

test('chamada que nao reporta gasto e registrada no card uma unica vez', () => {
  const id = cardComCusto('0.0000')
  markCostUnverified(id, 'codex')
  markCostUnverified(id, 'codex')
  const card = readCard(id)
  expect(card?.fm.cost_unverified).toBe('codex')
  expect(card?.body.match(/custo NAO reportado/g)?.length).toBe(1)
})

test('o teto recusa a garantia que nao tem quando parte do gasto nao e verificavel', () => {
  const id = cardComCusto('3.0000')
  markCostUnverified(id, 'codex')
  warnBudgetWithoutGuarantee(id, readCard(id)?.fm ?? {}, 10)
  const card = readCard(id)
  expect(card?.body).toContain('SEM GARANTIA')
  expect(card?.body).toContain('codex')
  expect(card?.fm.status).toBe('EXECUTING')
})

test('card com todo o gasto medido nao ganha ressalva de teto', () => {
  const id = cardComCusto('3.0000')
  warnBudgetWithoutGuarantee(id, readCard(id)?.fm ?? {}, 10)
  expect(readCard(id)?.body).not.toContain('SEM GARANTIA')
})

test('card marcado antes de existir o campo de piso continua ganhando a ressalva de teto', () => {
  const id = createCard({ title: 'card antigo', status: 'EXECUTING', repo: 'org/repo', cost_usd: '3.0000', cost_unverified: 'codex' }, '## Objetivo\nfazer algo\n')
  warnBudgetWithoutGuarantee(id, readCard(id)?.fm ?? {}, 10)
  expect(readCard(id)?.body).toContain('SEM GARANTIA')
})

test('sem teto configurado nao ha garantia a recusar', () => {
  const id = cardComCusto('3.0000')
  markCostUnverified(id, 'codex')
  warnBudgetWithoutGuarantee(id, readCard(id)?.fm ?? {}, 0)
  expect(readCard(id)?.body).not.toContain('SEM GARANTIA')
})
