import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRequest, AgentResult } from '../lib/ai/types'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-marca-custo-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
mkdirSync(process.env.HICODE_CARDS_DIR, { recursive: true })

const binDir = join(BASE, 'bin')
mkdirSync(binDir, { recursive: true })
const MODO = join(BASE, 'modo')
const RESPOSTA = join(BASE, 'resposta.jsonl')

function fakeBin(nome: string, script: string): void {
  const caminho = join(binDir, nome)
  writeFileSync(caminho, script)
  chmodSync(caminho, 0o755)
}

fakeBin('claude', `#!/usr/bin/env bash
case "$(cat ${MODO})" in
  trava) exec sleep 30 ;;
  morre) echo 'boom' >&2; exit 1 ;;
  *) cat ${RESPOSTA} ;;
esac
`)

fakeBin('codex', `#!/usr/bin/env bash
cat <<'FIM'
{"type":"item.completed","item":{"type":"agent_message","text":"apliquei a mudanca"}}
{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":4}}
FIM
`)

const pathOriginal = process.env.PATH ?? ''
process.env.PATH = `${binDir}:${pathOriginal}`

const { ClaudeProvider } = await import('../lib/ai/adapters/claude')
const { CodexProvider } = await import('../lib/ai/adapters/codex')
const { emptyUsage } = await import('../lib/ai/usage')
const { createCard, readCard } = await import('../lib/runner/card-store')
const { runProvider, warnBudgetWithoutGuarantee } = await import('../lib/runner/cost-trust')
const { classifyCostGap } = await import('../lib/runner/cost-gap')

afterAll(() => {
  process.env.PATH = pathOriginal
  rmSync(BASE, { recursive: true, force: true })
})

interface ResultadoClaude {
  type: string
  subtype: string
  result: string
  is_error: boolean
  total_cost_usd?: number
  usage: { input_tokens: number; output_tokens: number }
}

function resultado(custo?: number): ResultadoClaude {
  const base: ResultadoClaude = { type: 'result', subtype: 'success', result: 'feito', is_error: false, usage: { input_tokens: 10, output_tokens: 4 } }
  return typeof custo === 'number' ? { ...base, total_cost_usd: custo } : base
}

function claudeResponde(ev: ResultadoClaude): void {
  writeFileSync(RESPOSTA, JSON.stringify(ev) + '\n')
  writeFileSync(MODO, 'responde\n')
}

function claudeNoModo(modo: string): void {
  writeFileSync(MODO, `${modo}\n`)
}

function cardNovo(): string {
  return createCard({ title: 'ajuste no rodape', status: 'EXECUTING', repo: 'org/repo', cost_usd: '1.0000' }, '## Objetivo\nmudar o rodape\n')
}

function marca(id: string): string {
  return readCard(id)?.fm.cost_unverified ?? ''
}

function corpo(id: string): string {
  return readCard(id)?.body ?? ''
}

function piso(id: string): string {
  return readCard(id)?.fm.cost_floor ?? ''
}

function provedoresMarcados(id: string): string[] {
  return marca(id).split(',').map(p => p.trim()).filter(Boolean).sort()
}

function pedido(timeoutMs = 20000): AgentRequest {
  return { prompt: 'faca algo', cwd: BASE, dirs: [BASE], mode: 'readonly', useAgents: false, timeoutMs, liveLog: join(BASE, 'live.log') }
}

function resposta(over: Partial<AgentResult>): AgentResult {
  return { ok: true, failed: false, timedOut: false, isError: false, detail: '', text: '', cost: 0, costMeasured: false, usage: emptyUsage(), ...over }
}

test('custo desconhecido por TIMEOUT nao vira marca no card — a falha ja tem seu proprio registro', async () => {
  const id = cardNovo()
  claudeNoModo('trava')

  const res = await runProvider(id, new ClaudeProvider(), pedido(400))

  expect(res.timedOut).toBe(true)
  expect(res.costMeasured).toBe(false)
  expect(marca(id)).toBe('')
  expect(corpo(id)).not.toContain('custo NAO reportado')
})

test('REGRESSAO: chamada que morre com exit 1 nao acusa o provedor de nao saber medir', async () => {
  const id = cardNovo()
  claudeNoModo('morre')

  const res = await runProvider(id, new ClaudeProvider(), pedido())

  expect(res.ok).toBe(false)
  expect(res.costMeasured).toBe(false)
  expect(marca(id)).toBe('')
})

test('chamada que TRAVA deixa piso sem deixar marca — a CLI ja queimou os tokens antes de ser morta', async () => {
  const id = cardNovo()
  claudeNoModo('trava')

  const res = await runProvider(id, new ClaudeProvider(), pedido(400))

  expect(res.timedOut).toBe(true)
  expect(marca(id)).toBe('')
  expect(piso(id)).toBe('claude')
  expect(corpo(id)).toContain('chamada a claude terminou sem concluir')
  expect(corpo(id)).not.toContain('custo NAO reportado')
})

test('chamada que morre com exit 1 tambem deixa piso — ninguem sabe quanto ela gastou antes de morrer', async () => {
  const id = cardNovo()
  claudeNoModo('morre')

  await runProvider(id, new ClaudeProvider(), pedido())

  expect(marca(id)).toBe('')
  expect(piso(id)).toBe('claude')
})

test('o teto enxerga o piso deixado pela chamada que travou', async () => {
  const id = cardNovo()
  claudeNoModo('trava')
  await runProvider(id, new ClaudeProvider(), pedido(400))

  warnBudgetWithoutGuarantee(id, readCard(id)?.fm ?? {}, 5)

  expect(corpo(id)).toContain('SEM GARANTIA: ao menos uma chamada a claude terminou sem reportar gasto')
})

test('REGRESSAO: reexecucao medida depois de uma chamada interrompida nao apaga o piso nem cala a ressalva de teto', async () => {
  const id = cardNovo()
  claudeNoModo('trava')
  await runProvider(id, new ClaudeProvider(), pedido(400))
  claudeResponde(resultado(1.5))

  const medido = await runProvider(id, new ClaudeProvider(), pedido())
  warnBudgetWithoutGuarantee(id, readCard(id)?.fm ?? {}, 5)

  expect(medido.costMeasured).toBe(true)
  expect(marca(id)).toBe('')
  expect(piso(id)).toBe('claude')
  expect(corpo(id)).toContain('SEM GARANTIA')
})

test('o mesmo provedor falhando duas vezes nao duplica o piso nem a linha', async () => {
  const id = cardNovo()
  claudeNoModo('trava')

  await runProvider(id, new ClaudeProvider(), pedido(400))
  await runProvider(id, new ClaudeProvider(), pedido(400))

  expect(piso(id)).toBe('claude')
  expect(corpo(id).match(/terminou sem concluir/g)?.length).toBe(1)
})

test('chamada que CONCLUI sem informar gasto e marcada, e a frase fala da chamada, nao do provedor', async () => {
  const id = cardNovo()
  claudeResponde(resultado())

  const res = await runProvider(id, new ClaudeProvider(), pedido())

  expect(res.ok).toBe(true)
  expect(marca(id)).toBe('claude')
  expect(corpo(id)).toContain('custo NAO reportado: a chamada a claude terminou sem informar gasto')
})

test('execucao posterior que MEDE o custo limpa a marca e preserva a linha historica', async () => {
  const id = cardNovo()
  claudeResponde(resultado())
  await runProvider(id, new ClaudeProvider(), pedido())
  expect(marca(id)).toBe('claude')

  claudeResponde(resultado(0.42))
  const medido = await runProvider(id, new ClaudeProvider(), pedido())

  expect(medido.costMeasured).toBe(true)
  expect(marca(id)).toBe('')
  expect(corpo(id)).toContain('custo medido: claude informou o gasto desta chamada')
  expect(corpo(id)).toContain('custo NAO reportado')
})

test('REGRESSAO: chamada medida depois nao apaga o piso — o cost_usd continua subestimado, a ressalva de teto continua saindo', async () => {
  const id = cardNovo()
  claudeResponde(resultado())
  await runProvider(id, new ClaudeProvider(), pedido())
  claudeResponde(resultado(0.42))
  await runProvider(id, new ClaudeProvider(), pedido())
  expect(marca(id)).toBe('')

  warnBudgetWithoutGuarantee(id, readCard(id)?.fm ?? {}, 10)

  expect(corpo(id)).toContain('SEM GARANTIA: ao menos uma chamada a claude terminou sem reportar gasto')
  expect(readCard(id)?.fm.cost_floor).toBe('claude')
})

test('REGRESSAO: chamada barata que mede nao pode apagar o piso deixado pela chamada cara que nao mediu', async () => {
  const id = cardNovo()
  claudeResponde(resultado())
  await runProvider(id, new ClaudeProvider(), pedido())
  claudeResponde(resultado(0.001))
  await runProvider(id, new ClaudeProvider(), pedido())
  await runProvider(id, new CodexProvider(), pedido())

  warnBudgetWithoutGuarantee(id, readCard(id)?.fm ?? {}, 10)

  expect(marca(id)).toBe('codex')
  expect(readCard(id)?.fm.cost_floor?.split(',').map(p => p.trim()).sort()).toEqual(['claude', 'codex'])
  expect(corpo(id)).toContain('SEM GARANTIA: ao menos uma chamada a claude, codex terminou sem reportar gasto')
})

test('card em que TODA chamada reportou gasto nao ganha piso nem ressalva de teto', async () => {
  const id = cardNovo()
  claudeResponde(resultado(0.42))

  await runProvider(id, new ClaudeProvider(), pedido())
  warnBudgetWithoutGuarantee(id, readCard(id)?.fm ?? {}, 10)

  expect(readCard(id)?.fm.cost_floor).toBeUndefined()
  expect(corpo(id)).not.toContain('SEM GARANTIA')
})

test('dois provedores sem reporte aparecem os DOIS na marca e na ressalva de teto', async () => {
  const id = cardNovo()
  claudeResponde(resultado())

  await runProvider(id, new ClaudeProvider(), pedido())
  await runProvider(id, new CodexProvider(), pedido())

  expect(provedoresMarcados(id)).toEqual(['claude', 'codex'])
  warnBudgetWithoutGuarantee(id, readCard(id)?.fm ?? {}, 10)
  expect(corpo(id)).toContain('SEM GARANTIA: ao menos uma chamada a claude, codex terminou sem reportar gasto')
})

test('limpar um provedor preserva o outro que segue sem reporte', async () => {
  const id = cardNovo()
  claudeResponde(resultado())
  await runProvider(id, new ClaudeProvider(), pedido())
  await runProvider(id, new CodexProvider(), pedido())

  claudeResponde(resultado(0.9))
  await runProvider(id, new ClaudeProvider(), pedido())

  expect(marca(id)).toBe('codex')
  expect(corpo(id)).toContain('segue sem reporte: codex')
})

test('o mesmo provedor sem reporte duas vezes nao duplica a marca nem a linha de log', async () => {
  const id = cardNovo()
  claudeResponde(resultado())

  await runProvider(id, new ClaudeProvider(), pedido())
  await runProvider(id, new ClaudeProvider(), pedido())

  expect(marca(id)).toBe('claude')
  expect(corpo(id).match(/custo NAO reportado/g)?.length).toBe(1)
})

test('classifyCostGap separa custo medido, chamada falha e chamada sem reporte', () => {
  expect(classifyCostGap(resposta({ costMeasured: true }))).toBe('measured')
  expect(classifyCostGap(resposta({ ok: false, failed: true, timedOut: true }))).toBe('call_failed')
  expect(classifyCostGap(resposta({ ok: false, isError: true }))).toBe('call_failed')
  expect(classifyCostGap(resposta({ ok: true }))).toBe('unreported')
})
