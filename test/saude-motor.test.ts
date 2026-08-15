import { test, expect, beforeEach, afterAll } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Fields } from '../lib/card'

process.env.HICODE_COTA_TTL_MS = '0'

const { lerSaudeDoMotor } = await import('../lib/core/saude')
const { PROVEDOR_DESCONHECIDO } = await import('../lib/core/cota')
const { createCard } = await import('../lib/runner/card-store')

const criados: string[] = []
let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hicode-saude-'))
  criados.push(dir)
  process.env.HICODE_CARDS_DIR = dir
  mkdirSync(join(dir, 'runs'), { recursive: true })
})

afterAll(() => {
  for (const d of criados) rmSync(d, { recursive: true, force: true })
})

function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z')
}

function card(fm: Fields): string {
  return createCard({ title: 'tarefa', repo: 'org/repo', ...fm }, '## Objetivo\nalgo\n')
}

function runDeCota(id: string, quandoMs: number, provedor: string): void {
  const nome = `${id}-${new Date(quandoMs).toISOString().replace(/[^0-9]/g, '').slice(0, 14)}.json`
  writeFileSync(join(dir, 'runs', nome), JSON.stringify({
    id,
    ts: iso(quandoMs),
    ok: false,
    cost_usd: '0.0100',
    duration_s: 3,
    tokens_in: 0,
    tokens_out: 0,
    tokens_cache_create: 0,
    tokens_cache_read: 0,
    tokens_total: 5,
    steps: null,
    provider: provedor,
    model: '',
    failure_class: 'quota',
    failure_reason: 'cota do provedor esgotada',
  }))
}

test('tarefa esperando por falha passageira: provedor, motivo, tentativa e desde quando', () => {
  const agora = Math.floor(Date.now() / 1000) * 1000
  card({
    status: 'WAITING', wait_provider: 'claude', wait_reason: 'rede indisponivel',
    wait_attempts: '3', wait_until: iso(agora + 120_000), wait_resume_status: 'EXECUTING',
  })
  const saude = lerSaudeDoMotor(agora)
  expect(saude.estado).toBe('esperando-provedor')
  expect(saude.esperas).toHaveLength(1)
  const espera = saude.esperas[0]
  expect(espera?.provedor).toBe('claude')
  expect(espera?.provedorIdentificado).toBe(true)
  expect(espera?.motivo).toBe('rede indisponivel')
  expect(espera?.tentativas).toBe(3)
  expect(espera?.proximaTentativaEm).toBe(iso(agora + 120_000))
  expect(Date.parse(espera?.esperandoDesde ?? '')).toBe(agora + 120_000 - (30_000 + 60_000 + 120_000))
  expect(espera?.atrasoMs).toBe(0)
})

test('WAITING vencido ha muito tempo: atraso denuncia motor parado (ninguem acordou o card)', () => {
  const agora = Math.floor(Date.now() / 1000) * 1000
  card({ status: 'WAITING', wait_provider: 'codex', wait_reason: '5xx do provedor', wait_attempts: '1', wait_until: iso(agora - 15 * 60_000) })
  const saude = lerSaudeDoMotor(agora)
  expect(saude.esperas[0]?.atrasoMs).toBe(15 * 60_000)
})

test('espera sem provedor gravado nao vira claude', () => {
  const agora = Math.floor(Date.now() / 1000) * 1000
  card({ status: 'WAITING', wait_provider: '', wait_reason: 'timeout', wait_attempts: '1', wait_until: iso(agora + 30_000) })
  const saude = lerSaudeDoMotor(agora)
  expect(saude.esperas[0]?.provedor).toBe(PROVEDOR_DESCONHECIDO)
  expect(saude.esperas[0]?.provedorIdentificado).toBe(false)
  expect(saude.provedoresIndisponiveis[0]?.provedor).toBe(PROVEDOR_DESCONHECIDO)
})

test('qual provedor esta fora e desde quando: agrupa os cards que esperam por ele', () => {
  const agora = Math.floor(Date.now() / 1000) * 1000
  card({ status: 'WAITING', wait_provider: 'claude', wait_reason: 'rede indisponivel', wait_attempts: '1', wait_until: iso(agora + 30_000) })
  card({ status: 'WAITING', wait_provider: 'claude', wait_reason: 'rede indisponivel', wait_attempts: '3', wait_until: iso(agora + 60_000) })
  const fora = lerSaudeDoMotor(agora).provedoresIndisponiveis
  expect(fora).toHaveLength(1)
  expect(fora[0]?.provedor).toBe('claude')
  expect(fora[0]?.cardsEsperando).toEqual(['001', '002'])
  expect(Date.parse(fora[0]?.desde ?? '')).toBe(agora + 60_000 - (30_000 + 60_000 + 120_000))
})

test('HALTED por cota aparece como parado por cota, com provedor e hora', () => {
  const agora = Math.floor(Date.now() / 1000) * 1000
  card({ status: 'HALTED', halt_class: 'quota', halt_provider: 'claude', halt_reason: 'limite de uso atingido', halt_at: iso(agora - 5 * 60_000) })
  const saude = lerSaudeDoMotor(agora)
  expect(saude.estado).toBe('cota-esgotada')
  expect(saude.paradosPorCota).toEqual(['001'])
  expect(saude.provedoresIndisponiveis[0]?.limiteDeCota).toBe(true)
  expect(saude.provedoresIndisponiveis[0]?.desde).toBe(iso(agora - 5 * 60_000))
  expect(saude.provedoresIndisponiveis[0]?.motivo).toBe('limite de uso atingido')
})

test('HALTED antigo sem halt_class e reconhecido pelo run de cota na janela', () => {
  const agora = Math.floor(Date.now() / 1000) * 1000
  card({ status: 'HALTED' })
  runDeCota('001', agora - 30 * 60_000, 'codex')
  const saude = lerSaudeDoMotor(agora)
  expect(saude.paradosPorCota).toEqual(['001'])
  expect(saude.provedoresIndisponiveis[0]?.provedor).toBe('codex')
  expect(saude.provedoresIndisponiveis[0]?.cardsParados).toEqual(['001'])
  expect(saude.estado).toBe('cota-esgotada')
})

test('tick falhando vence tudo — o silencio do motor NAO e normal', () => {
  const agora = Math.floor(Date.now() / 1000) * 1000
  card({ status: 'WAITING', wait_provider: 'claude', wait_reason: 'rede indisponivel', wait_attempts: '1', wait_until: iso(agora + 30_000) })
  writeFileSync(join(dir, 'runs', 'daemon-health.json'), JSON.stringify({
    consecutiveFailures: 4,
    lastError: 'tick: ENOSPC',
    lastErrorAt: iso(agora - 60_000),
  }))
  const saude = lerSaudeDoMotor(agora)
  expect(saude.estado).toBe('tick-falhando')
  expect(saude.tick.falhasSeguidas).toBe(4)
  expect(saude.tick.ultimoErro).toBe('tick: ENOSPC')
  expect(saude.tick.ultimoErroEm).toBe(iso(agora - 60_000))
})

test('card em execucao: motor trabalhando; nada em voo: ocioso', () => {
  const agora = Math.floor(Date.now() / 1000) * 1000
  expect(lerSaudeDoMotor(agora).estado).toBe('ocioso')
  card({ status: 'EXECUTING' })
  expect(lerSaudeDoMotor(agora).estado).toBe('trabalhando')
})

test('READY parado na fila nao conta como trabalhando', () => {
  card({ status: 'READY' })
  expect(lerSaudeDoMotor(Date.now()).estado).toBe('ocioso')
})

test('a leitura de cota vem junto — uma chamada responde gasto e saude', () => {
  const agora = Math.floor(Date.now() / 1000) * 1000
  runDeCota('001', agora - 10 * 60_000, 'claude')
  const saude = lerSaudeDoMotor(agora)
  expect(saude.cota.runs).toBe(1)
  expect(saude.cota.limiteAtingido).toBe(true)
  expect(saude.cota.provedores[0]?.provedor).toBe('claude')
})
