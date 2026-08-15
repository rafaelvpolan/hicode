import { test, expect, beforeEach, afterAll } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

process.env.HICODE_COTA_TTL_MS = '0'

const { lerCota, JANELA_COTA_MS, PROVEDOR_DESCONHECIDO } = await import('../lib/core/cota')

const HORA_MS = 60 * 60 * 1000
const criados: string[] = []
let dir = ''

function segundoCheio(): number {
  return Math.floor(Date.now() / 1000) * 1000
}

function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hicode-cota-'))
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
  tokens: number
  provedor?: string
  modelo?: string
  classe?: string
  motivo?: string
}

function nomeDoArquivo(id: string, quandoMs: number): string {
  return `${id}-${new Date(quandoMs).toISOString().replace(/[^0-9]/g, '').slice(0, 14)}.json`
}

function gravarRun(r: RunGravado): string {
  const ts = iso(r.quandoMs)
  const conteudo = {
    id: r.id,
    ts,
    ok: !r.classe,
    cost_usd: r.custo,
    duration_s: 10,
    tokens_in: 0,
    tokens_out: 0,
    tokens_cache_create: 0,
    tokens_cache_read: 0,
    tokens_total: r.tokens,
    steps: null,
    provider: r.provedor ?? '',
    model: r.modelo ?? '',
    failure_class: r.classe ?? '',
    failure_reason: r.motivo ?? '',
  }
  const caminho = join(dir, 'runs', nomeDoArquivo(r.id, r.quandoMs))
  writeFileSync(caminho, JSON.stringify(conteudo, null, 2))
  return caminho
}

test('agrega por provedor, nao um numero global', () => {
  const agora = segundoCheio()
  gravarRun({ id: '001', quandoMs: agora - HORA_MS, custo: '1.5000', tokens: 100, provedor: 'claude', modelo: 'opus' })
  gravarRun({ id: '002', quandoMs: agora - 2 * HORA_MS, custo: '0.2500', tokens: 40, provedor: 'claude', modelo: 'sonnet' })
  gravarRun({ id: '003', quandoMs: agora - 30 * 60_000, custo: '0.1000', tokens: 10, provedor: 'codex' })
  const cota = lerCota(agora)
  expect(cota.provedores.map(p => p.provedor)).toEqual(['claude', 'codex'])
  const claude = cota.provedores[0]
  expect(claude?.custoUsd).toBe(1.75)
  expect(claude?.tokens).toBe(140)
  expect(claude?.runs).toBe(2)
  expect(claude?.modelos).toEqual(['opus', 'sonnet'])
  expect(cota.custoUsd).toBe(1.85)
  expect(cota.tokens).toBe(150)
  expect(cota.runs).toBe(3)
})

test('janela MOVEL: run de 3h59 conta, run de 4h10 nao', () => {
  const agora = segundoCheio()
  gravarRun({ id: '001', quandoMs: agora - (3 * HORA_MS + 59 * 60_000), custo: '1.0000', tokens: 10, provedor: 'claude' })
  gravarRun({ id: '002', quandoMs: agora - (4 * HORA_MS + 10 * 60_000), custo: '9.0000', tokens: 90, provedor: 'claude' })
  const cota = lerCota(agora)
  expect(cota.runs).toBe(1)
  expect(cota.custoUsd).toBe(1)
})

test('a virada: o mesmo run entra na janela e sai um milissegundo depois', () => {
  const agora = segundoCheio()
  const naBorda = agora - JANELA_COTA_MS
  gravarRun({ id: '001', quandoMs: naBorda, custo: '2.0000', tokens: 20, provedor: 'claude' })
  expect(lerCota(naBorda + JANELA_COTA_MS).runs).toBe(1)
  expect(lerCota(naBorda + JANELA_COTA_MS + 1).runs).toBe(0)
})

test('quando a janela vira: o gasto mais antigo sai 4h depois de ter acontecido', () => {
  const agora = segundoCheio()
  const maisAntigo = agora - 3 * HORA_MS
  gravarRun({ id: '001', quandoMs: maisAntigo, custo: '1.0000', tokens: 10, provedor: 'claude' })
  gravarRun({ id: '002', quandoMs: agora - HORA_MS, custo: '1.0000', tokens: 10, provedor: 'claude' })
  const cota = lerCota(agora)
  expect(Date.parse(cota.janelaViraEm)).toBe(maisAntigo + JANELA_COTA_MS)
  expect(cota.janelaViraDaquiMs).toBe(HORA_MS)
  expect(cota.provedores[0]?.janelaViraEm).toBe(cota.janelaViraEm)
})

test('run antigo sem provedor gravado vira desconhecido explicito — nao vira claude', () => {
  const agora = segundoCheio()
  writeFileSync(join(dir, 'runs', nomeDoArquivo('001', agora - HORA_MS)), JSON.stringify({
    id: '001',
    ts: iso(agora - HORA_MS),
    ok: true,
    cost_usd: '1.0926',
    duration_s: 182,
    tokens_in: 19,
    tokens_out: 4971,
    tokens_cache_create: 37938,
    tokens_cache_read: 456579,
    tokens_total: 42928,
    steps: null,
  }))
  const cota = lerCota(agora)
  expect(cota.provedores).toHaveLength(1)
  expect(cota.provedores[0]?.provedor).toBe(PROVEDOR_DESCONHECIDO)
  expect(cota.provedores[0]?.provedorIdentificado).toBe(false)
  expect(cota.provedores[0]?.custoUsd).toBe(1.0926)
  expect(cota.provedores[0]?.tokens).toBe(42928)
})

test('desconhecido nao se mistura com provedor identificado', () => {
  const agora = segundoCheio()
  gravarRun({ id: '001', quandoMs: agora - HORA_MS, custo: '1.0000', tokens: 10 })
  gravarRun({ id: '002', quandoMs: agora - HORA_MS, custo: '2.0000', tokens: 20, provedor: 'claude' })
  const cota = lerCota(agora)
  expect(cota.provedores.map(p => p.provedor)).toEqual(['claude', PROVEDOR_DESCONHECIDO])
  expect(cota.provedores.map(p => p.provedorIdentificado)).toEqual([true, false])
})

test('sinal de limite atingido sai do run que falhou por cota, com hora e card', () => {
  const agora = segundoCheio()
  gravarRun({ id: '007', quandoMs: agora - 20 * 60_000, custo: '0.0100', tokens: 5, provedor: 'claude', classe: 'quota', motivo: 'limite de uso da assinatura Claude atingido' })
  gravarRun({ id: '008', quandoMs: agora - 10 * 60_000, custo: '0.0100', tokens: 5, provedor: 'codex', classe: 'transient', motivo: 'rede indisponivel' })
  const cota = lerCota(agora)
  expect(cota.limiteAtingido).toBe(true)
  const claude = cota.provedores.find(p => p.provedor === 'claude')
  expect(claude?.limiteAtingido).toBe(true)
  expect(claude?.limiteMotivo).toBe('limite de uso da assinatura Claude atingido')
  expect(claude?.limiteAtingidoEm).toBe(iso(agora - 20 * 60_000))
  expect(claude?.cardsNoLimite).toEqual(['007'])
  expect(cota.provedores.find(p => p.provedor === 'codex')?.limiteAtingido).toBe(false)
  expect(cota.provedores.find(p => p.provedor === 'codex')?.runsComFalha).toBe(1)
})

test('limite fora da janela nao alarma mais', () => {
  const agora = segundoCheio()
  gravarRun({ id: '007', quandoMs: agora - (5 * HORA_MS), custo: '0.0100', tokens: 5, provedor: 'claude', classe: 'quota', motivo: 'cota esgotada' })
  expect(lerCota(agora).limiteAtingido).toBe(false)
})

test('arquivo de run ilegivel e contado, nao engolido', () => {
  const agora = segundoCheio()
  gravarRun({ id: '001', quandoMs: agora - HORA_MS, custo: '1.0000', tokens: 10, provedor: 'claude' })
  writeFileSync(join(dir, 'runs', nomeDoArquivo('002', agora - HORA_MS)), '{ pela metade')
  const cota = lerCota(agora)
  expect(cota.runs).toBe(1)
  expect(cota.runsIgnorados).toBe(1)
})

test('sem runs a leitura e vazia e nao explode', () => {
  const cota = lerCota(segundoCheio())
  expect(cota.provedores).toEqual([])
  expect(cota.custoUsd).toBe(0)
  expect(cota.janelaViraEm).toBe('')
  expect(cota.janelaViraDaquiMs).toBe(0)
  expect(cota.limiteAtingido).toBe(false)
})

test('ignora arquivos que nao sao run (live.log, clarify, daemon-health)', () => {
  const agora = segundoCheio()
  writeFileSync(join(dir, 'runs', 'daemon-health.json'), JSON.stringify({ consecutiveFailures: 2 }))
  writeFileSync(join(dir, 'runs', '001.clarify.json'), JSON.stringify({ perguntas: [] }))
  writeFileSync(join(dir, 'runs', '001.live.log'), 'linha')
  gravarRun({ id: '001', quandoMs: agora - HORA_MS, custo: '1.0000', tokens: 10, provedor: 'claude' })
  const cota = lerCota(agora)
  expect(cota.runs).toBe(1)
  expect(cota.runsIgnorados).toBe(0)
})

test('leitura de um instante passado nao mente: sai do cache da janela atual e le o periodo pedido', () => {
  const agora = segundoCheio()
  gravarRun({ id: '001', quandoMs: agora - 6 * HORA_MS, custo: '4.0000', tokens: 40, provedor: 'claude' })
  expect(lerCota(agora).runs).toBe(0)
  expect(lerCota(agora - 5 * HORA_MS).runs).toBe(1)
  expect(lerCota(agora - 5 * HORA_MS).custoUsd).toBe(4)
})
