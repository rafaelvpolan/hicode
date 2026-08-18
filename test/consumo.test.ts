import { test, expect, beforeEach, afterAll } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

process.env.HICODE_COTA_TTL_MS = '0'

const { consumoPorProvedor, serieDeCusto, JANELA_5H, JANELA_SEMANA } = await import('../lib/ai/consumo')
const { PROVEDOR_DESCONHECIDO } = await import('../lib/core/cota-runs')

const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS
const AGORA = Date.parse('2026-08-10T12:00:00Z')

const criados: string[] = []
let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hicode-consumo-'))
  criados.push(dir)
  process.env.HICODE_CARDS_DIR = dir
  mkdirSync(join(dir, 'runs'), { recursive: true })
})

afterAll(() => {
  for (const d of criados) rmSync(d, { recursive: true, force: true })
})

interface RunGravado {
  id: string
  quandoMs: number
  custo: string
  entrada?: number
  saida?: number
  cache?: number
  total?: number
  provedor?: string
  modelo?: string
  classe?: string
}

function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z')
}

function nomeDoArquivo(id: string, quandoMs: number): string {
  return `${id}-${new Date(quandoMs).toISOString().replace(/[^0-9]/g, '').slice(0, 14)}.json`
}

function gravarRun(r: RunGravado): void {
  const entrada = r.entrada ?? 0
  const saida = r.saida ?? 0
  const cache = r.cache ?? 0
  const conteudo: Record<string, string | number | boolean | null> = {
    id: r.id,
    ts: iso(r.quandoMs),
    ok: !r.classe,
    cost_usd: r.custo,
    duration_s: 10,
    tokens_in: entrada,
    tokens_out: saida,
    tokens_cache_create: cache,
    tokens_cache_read: 0,
    steps: null,
    provider: r.provedor ?? '',
    model: r.modelo ?? '',
    failure_class: r.classe ?? '',
    failure_reason: r.classe ? 'falhou' : '',
  }
  if (r.total !== undefined) conteudo.tokens_total = r.total
  writeFileSync(join(dir, 'runs', nomeDoArquivo(r.id, r.quandoMs)), JSON.stringify(conteudo, null, 2))
}

function somar(valores: number[]): number {
  return valores.reduce((t, v) => t + v, 0)
}

test('sem nenhum run a lista e vazia e a serie e de zeros', () => {
  expect(consumoPorProvedor(JANELA_5H, AGORA)).toEqual([])
  expect(consumoPorProvedor(JANELA_SEMANA, AGORA)).toEqual([])
  expect(serieDeCusto(JANELA_5H, 4, AGORA)).toEqual([0, 0, 0, 0])
})

test('agrupa por provedor, ordena por gasto decrescente e junta os modelos', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '1.5000', entrada: 10, saida: 20, cache: 30, provedor: 'claude', modelo: 'opus' })
  gravarRun({ id: '002', quandoMs: AGORA - 2 * HORA_MS, custo: '0.2500', entrada: 1, saida: 2, cache: 3, provedor: 'claude', modelo: 'sonnet' })
  gravarRun({ id: '003', quandoMs: AGORA - 30 * 60_000, custo: '0.9000', entrada: 5, saida: 5, cache: 0, provedor: 'codex', modelo: 'gpt' })
  const consumo = consumoPorProvedor(JANELA_5H, AGORA)
  expect(consumo.map(c => c.provedor)).toEqual(['claude', 'codex'])
  const claude = consumo[0]
  expect(claude?.custoUsd).toBe(1.75)
  expect(claude?.runs).toBe(2)
  expect(claude?.falhas).toBe(0)
  expect(claude?.modelos).toEqual(['opus', 'sonnet'])
  expect(claude?.ultimoEm).toBe(iso(AGORA - HORA_MS))
})

test('total de tokens separado por tipo, e o total continua sendo a soma', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '1.0000', entrada: 19, saida: 4971, cache: 37938, provedor: 'claude' })
  gravarRun({ id: '002', quandoMs: AGORA - 2 * HORA_MS, custo: '1.0000', entrada: 1, saida: 29, cache: 62, provedor: 'claude' })
  const claude = consumoPorProvedor(JANELA_5H, AGORA)[0]
  expect(claude?.tokensEntrada).toBe(20)
  expect(claude?.tokensSaida).toBe(5000)
  expect(claude?.tokensCache).toBe(38000)
  expect(claude?.tokens).toBe(43020)
})

test('run sem provider cai em desconhecido e nao se mistura com provedor identificado', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '3.0000', entrada: 7, saida: 3, provedor: 'claude' })
  gravarRun({ id: '002', quandoMs: AGORA - HORA_MS + 1000, custo: '1.0000', entrada: 2, saida: 1 })
  const consumo = consumoPorProvedor(JANELA_5H, AGORA)
  expect(consumo.map(c => c.provedor)).toEqual(['claude', PROVEDOR_DESCONHECIDO])
  expect(consumo[1]?.custoUsd).toBe(1)
  expect(consumo[1]?.tokens).toBe(3)
})

test('custo nao numerico conta como zero e nao contamina o total', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: 'n/a', entrada: 10, saida: 5, provedor: 'claude' })
  gravarRun({ id: '002', quandoMs: AGORA - 2 * HORA_MS, custo: '0.5000', entrada: 1, saida: 1, provedor: 'claude' })
  const claude = consumoPorProvedor(JANELA_5H, AGORA)[0]
  expect(claude?.custoUsd).toBe(0.5)
  expect(claude?.runs).toBe(2)
  expect(claude?.tokens).toBe(17)
  expect(somar(serieDeCusto(JANELA_5H, 5, AGORA))).toBeCloseTo(0.5, 4)
})

test('run fora da janela nao conta', () => {
  gravarRun({ id: '001', quandoMs: AGORA - (5 * HORA_MS + 60_000), custo: '9.0000', entrada: 900, provedor: 'claude' })
  gravarRun({ id: '002', quandoMs: AGORA - (4 * HORA_MS + 59 * 60_000), custo: '1.0000', entrada: 10, provedor: 'claude' })
  const consumo = consumoPorProvedor(JANELA_5H, AGORA)
  expect(consumo).toHaveLength(1)
  expect(consumo[0]?.runs).toBe(1)
  expect(consumo[0]?.custoUsd).toBe(1)
  expect(somar(serieDeCusto(JANELA_5H, 10, AGORA))).toBeCloseTo(1, 4)
})

test('falha entra na contagem de falhas sem sair da contagem de runs', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '0.1000', entrada: 5, provedor: 'claude', classe: 'quota' })
  gravarRun({ id: '002', quandoMs: AGORA - 2 * HORA_MS, custo: '0.1000', entrada: 5, provedor: 'claude' })
  const claude = consumoPorProvedor(JANELA_5H, AGORA)[0]
  expect(claude?.runs).toBe(2)
  expect(claude?.falhas).toBe(1)
})

test('5h e semana dao resultados diferentes para o mesmo conjunto', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '1.0000', entrada: 10, provedor: 'claude', modelo: 'opus' })
  gravarRun({ id: '002', quandoMs: AGORA - 3 * DIA_MS, custo: '4.0000', entrada: 40, provedor: 'claude', modelo: 'haiku' })
  gravarRun({ id: '003', quandoMs: AGORA - 6 * DIA_MS, custo: '2.0000', entrada: 20, provedor: 'codex' })
  gravarRun({ id: '004', quandoMs: AGORA - 8 * DIA_MS, custo: '50.0000', entrada: 500, provedor: 'codex' })

  const cinco = consumoPorProvedor(JANELA_5H, AGORA)
  expect(cinco.map(c => c.provedor)).toEqual(['claude'])
  expect(cinco[0]?.custoUsd).toBe(1)
  expect(cinco[0]?.modelos).toEqual(['opus'])

  const semana = consumoPorProvedor(JANELA_SEMANA, AGORA)
  expect(semana.map(c => c.provedor)).toEqual(['claude', 'codex'])
  expect(semana[0]?.custoUsd).toBe(5)
  expect(semana[0]?.runs).toBe(2)
  expect(semana[0]?.modelos).toEqual(['haiku', 'opus'])
  expect(semana[1]?.custoUsd).toBe(2)
})

test('a soma dos baldes e igual ao custo total da janela', () => {
  gravarRun({ id: '001', quandoMs: AGORA - 4 * HORA_MS, custo: '0.2500', entrada: 10, provedor: 'claude' })
  gravarRun({ id: '002', quandoMs: AGORA - 2 * HORA_MS, custo: '1.5000', entrada: 10, provedor: 'claude' })
  gravarRun({ id: '003', quandoMs: AGORA - 10 * 60_000, custo: '0.1250', entrada: 10, provedor: 'codex' })
  const total = somar(consumoPorProvedor(JANELA_5H, AGORA).map(c => c.custoUsd))
  const serie = serieDeCusto(JANELA_5H, 5, AGORA)
  expect(serie).toHaveLength(5)
  expect(somar(serie)).toBeCloseTo(total, 4)
  expect(somar(serie)).toBeCloseTo(1.875, 4)
})

test('a serie vai do balde mais antigo para o mais recente', () => {
  gravarRun({ id: '001', quandoMs: AGORA - (5 * HORA_MS - 60_000), custo: '1.0000', entrada: 1, provedor: 'claude' })
  gravarRun({ id: '002', quandoMs: AGORA - 60_000, custo: '3.0000', entrada: 1, provedor: 'claude' })
  expect(serieDeCusto(JANELA_5H, 5, AGORA)).toEqual([1, 0, 0, 0, 3])
})

test('baldes 0 ou negativo devolve serie vazia, baldes 1 devolve o total da janela', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '2.0000', entrada: 1, provedor: 'claude' })
  gravarRun({ id: '002', quandoMs: AGORA - 4 * HORA_MS, custo: '0.5000', entrada: 1, provedor: 'claude' })
  expect(serieDeCusto(JANELA_5H, 0, AGORA)).toEqual([])
  expect(serieDeCusto(JANELA_5H, -3, AGORA)).toEqual([])
  expect(serieDeCusto(JANELA_5H, 1, AGORA)).toEqual([2.5])
})

test('sem tokens_total o total sai da soma das partes', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '1.0000', entrada: 3, saida: 4, cache: 5, provedor: 'claude' })
  expect(consumoPorProvedor(JANELA_5H, AGORA)[0]?.tokens).toBe(12)
})

test('tokens_total maior que as partes preserva o total medido e a separacao conhecida', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '1.0000', entrada: 3, saida: 4, cache: 5, total: 100, provedor: 'claude' })
  const claude = consumoPorProvedor(JANELA_5H, AGORA)[0]
  expect(claude?.tokens).toBe(100)
  expect(claude?.tokensEntrada).toBe(3)
  expect(claude?.tokensSaida).toBe(4)
  expect(claude?.tokensCache).toBe(5)
})

test('a parte nao separada fecha a conta com as partes conhecidas', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '1.0000', entrada: 13, saida: 5026, cache: 36373, total: 147151, provedor: 'claude' })
  gravarRun({ id: '002', quandoMs: AGORA - 2 * HORA_MS, custo: '1.0000', entrada: 3, saida: 4, cache: 5, provedor: 'claude' })
  const claude = consumoPorProvedor(JANELA_5H, AGORA)[0]
  expect(claude?.tokensNaoSeparados).toBe(147151 - 41412)
  expect(somar([claude?.tokensEntrada ?? 0, claude?.tokensSaida ?? 0, claude?.tokensCache ?? 0, claude?.tokensNaoSeparados ?? 0])).toBe(claude?.tokens ?? 0)
})

test('tokens_total menor que as partes nao gera parte negativa nem total abaixo das partes', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '1.0000', entrada: 3, saida: 4, cache: 5, total: 2, provedor: 'claude' })
  const claude = consumoPorProvedor(JANELA_5H, AGORA)[0]
  expect(claude?.tokensNaoSeparados).toBe(0)
  expect(claude?.tokens).toBe(12)
})

test('custo igual desempata por tokens e depois por nome do provedor', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '1.0000', entrada: 500, provedor: 'zeta' })
  gravarRun({ id: '002', quandoMs: AGORA - HORA_MS, custo: '1.0000', entrada: 100, provedor: 'alfa' })
  gravarRun({ id: '003', quandoMs: AGORA - HORA_MS, custo: '1.0000', entrada: 100, provedor: 'beta' })
  expect(consumoPorProvedor(JANELA_5H, AGORA).map(c => c.provedor)).toEqual(['zeta', 'alfa', 'beta'])
})

test('custo negativo em disco nao vira credito no total nem na serie', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '-5.0000', entrada: 1, provedor: 'claude' })
  gravarRun({ id: '002', quandoMs: AGORA - 2 * HORA_MS, custo: '2.0000', entrada: 1, provedor: 'claude' })
  const claude = consumoPorProvedor(JANELA_5H, AGORA)[0]
  expect(claude?.runs).toBe(2)
  expect(claude?.custoUsd).toBe(2)
  expect(serieDeCusto(JANELA_5H, 1, AGORA)).toEqual([2])
})

test('run com carimbo no futuro conta e cai no ultimo balde', () => {
  gravarRun({ id: '001', quandoMs: AGORA + 10 * 60_000, custo: '2.0000', entrada: 1, provedor: 'claude' })
  gravarRun({ id: '002', quandoMs: AGORA - 4 * HORA_MS, custo: '1.0000', entrada: 1, provedor: 'claude' })
  const claude = consumoPorProvedor(JANELA_5H, AGORA)[0]
  expect(claude?.runs).toBe(2)
  expect(claude?.custoUsd).toBe(3)
  expect(serieDeCusto(JANELA_5H, 5, AGORA)).toEqual([0, 1, 0, 0, 2])
})

test('run exatamente no inicio da janela conta e cai no primeiro balde', () => {
  gravarRun({ id: '001', quandoMs: AGORA - 5 * HORA_MS, custo: '1.0000', entrada: 1, provedor: 'claude' })
  expect(consumoPorProvedor(JANELA_5H, AGORA)[0]?.runs).toBe(1)
  expect(serieDeCusto(JANELA_5H, 5, AGORA)).toEqual([1, 0, 0, 0, 0])
})

test('baldes fracionario e truncado para baixo', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '1.0000', entrada: 1, provedor: 'claude' })
  expect(serieDeCusto(JANELA_5H, 3.9, AGORA)).toEqual([0, 0, 1])
})

test('janela nao numerica nao inventa consumo', () => {
  gravarRun({ id: '001', quandoMs: AGORA - HORA_MS, custo: '1.0000', entrada: 1, provedor: 'claude' })
  expect(consumoPorProvedor(Number.NaN, AGORA)).toEqual([])
  expect(serieDeCusto(Number.NaN, 3, AGORA)).toEqual([0, 0, 0])
})
