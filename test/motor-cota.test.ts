import { test, expect, afterAll } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-motor-cota-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
const RUNS_DIR = join(process.env.HICODE_CARDS_DIR, 'runs')
mkdirSync(RUNS_DIR, { recursive: true })

const { lerExecucoes } = await import('../panel/server/motor/execucoes')
const { lerCota } = await import('../panel/server/motor/cota')

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

function escrever<T extends object>(nome: string, conteudo: T): void {
  writeFileSync(join(RUNS_DIR, nome), JSON.stringify(conteudo))
}

test('registro de conversa (sem cardId) entra na leitura de execucoes, marcado como tipo conversa', () => {
  escrever('conversa-20260819120000-1.json', {
    ts: '2026-08-19T12:00:00Z',
    ok: true,
    cost_usd: '0.02',
    kind: 'conversa',
    ias: [{ provedor: 'kimi', modelo: 'k2', custoUsd: 0.02, tokens: 20, chamadas: 1, falhas: 0 }],
  })
  const { execucoes, ignorados } = lerExecucoes()
  const conversa = execucoes.find(e => e.arquivo === 'conversa-20260819120000-1.json')
  expect(ignorados).toBe(0)
  expect(conversa?.tipo).toBe('conversa')
  expect(conversa?.cardId).toBe('')
})

test('json invalido conta como ignorado, nao derruba a leitura das demais', () => {
  const antes = lerExecucoes().ignorados
  writeFileSync(join(RUNS_DIR, '002-20260819120100.json'), '{ nao e json')
  const depois = lerExecucoes()
  expect(depois.ignorados).toBe(antes + 1)
})

test('arquivo cujo nome nao bate com nenhum padrao de sessao e ignorado silenciosamente, sem contar como ignorado', () => {
  const antes = lerExecucoes().ignorados
  writeFileSync(join(RUNS_DIR, 'nao-e-um-run.txt'), 'lixo')
  const depois = lerExecucoes()
  expect(depois.ignorados).toBe(antes)
})

test('cota atribui custo/tokens por ias[], nao 100% ao provider do topo da run', () => {
  escrever('003-20260819130000.json', {
    id: '003',
    ts: '2026-08-19T13:00:00Z',
    ok: true,
    cost_usd: '0.10',
    tokens_total: 100,
    provider: 'claude',
    model: 'sonnet',
    ias: [
      { provedor: 'claude', modelo: 'sonnet', custoUsd: 0.06, tokens: 60, chamadas: 1, falhas: 0 },
      { provedor: 'codex', modelo: 'gpt', custoUsd: 0.04, tokens: 40, chamadas: 1, falhas: 0 },
    ],
  })
  const cota = lerCota(Date.parse('2026-08-19T13:05:00Z'))
  const claude = cota.provedores.find(p => p.provedor === 'claude')
  const codex = cota.provedores.find(p => p.provedor === 'codex')
  expect(claude?.custoUsd).toBe(0.06)
  expect(codex?.custoUsd).toBe(0.04)
})

test('run sem ias[] ainda atribui 100% ao provider do topo (compatibilidade com runs antigos)', () => {
  escrever('004-20260819140000.json', {
    id: '004',
    ts: '2026-08-19T14:00:00Z',
    ok: true,
    cost_usd: '0.05',
    tokens_total: 50,
    provider: 'ollama',
    model: 'llama',
  })
  const cota = lerCota(Date.parse('2026-08-19T14:05:00Z'))
  const ollama = cota.provedores.find(p => p.provedor === 'ollama')
  expect(ollama?.custoUsd).toBe(0.05)
})

test('tokens_total ausente/zero cai para tokens_in+tokens_out+tokens_cache_create, como o hii faz', () => {
  escrever('005-20260819150000.json', {
    id: '005',
    ts: '2026-08-19T15:00:00Z',
    ok: true,
    cost_usd: '0.03',
    tokens_in: 30,
    tokens_out: 12,
    tokens_cache_create: 8,
    provider: 'claude',
    model: 'sonnet',
  })
  const { execucoes } = lerExecucoes()
  const run = execucoes.find(e => e.arquivo === '005-20260819150000.json')
  expect(run?.tokensTotal).toBe(50)
})

test('ignorados respeita a janela pedida, como o hii faz — falha fora da janela nao entra na contagem', () => {
  writeFileSync(join(RUNS_DIR, '006-20260101000000.json'), '{ nao e json')
  const agoraMs = Date.parse('2026-08-19T15:05:00Z')
  const janelaCurtaMs = agoraMs - 60_000
  const { ignorados } = lerExecucoes(janelaCurtaMs)
  expect(ignorados).toBe(0)
  const { ignorados: semJanela } = lerExecucoes()
  expect(semJanela).toBeGreaterThan(0)
})
