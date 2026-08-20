import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-motor-acompanhar-disco-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
const RUNS_DIR = join(process.env.HICODE_CARDS_DIR, 'runs')
mkdirSync(RUNS_DIR, { recursive: true })

const { createCard, updateCard } = await import('../panel/server/card')
const { acompanharDoDisco } = await import('../panel/server/motor/eventos')
import type { EventoDoMotor } from '../panel/server/motor/types'

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

function liveLogPath(id: string): string {
  return join(RUNS_DIR, `${id}.live.log`)
}

async function drenarEAbortarAoFim(
  it: AsyncGenerator<EventoDoMotor>,
  controlador: AbortController,
  quantidadeEsperada: number,
): Promise<EventoDoMotor[]> {
  const eventos: EventoDoMotor[] = []
  for (;;) {
    const passo = await it.next()
    if (passo.done) break
    eventos.push(passo.value)
    if (eventos.length >= quantidadeEsperada) controlador.abort()
  }
  return eventos
}

function depoisDaPrimeiraVoltaDoPoll(escreverFixture: () => void): void {
  setTimeout(escreverFixture, 0)
}

test('acompanharDoDisco emite, numa unica leitura, log/runs/perguntas/veredito/pausa nessa ordem e encerra limpo no abort', async () => {
  const id = createCard({ title: 'fluxo', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\nfluxo\n')

  const controlador = new AbortController()
  const it = acompanharDoDisco(id, { signal: controlador.signal })

  depoisDaPrimeiraVoltaDoPoll(() => {
    writeFileSync(liveLogPath(id), '  → bash(ls)\n  ← ok\n— concluido (custo $0.1000) —\n')
    writeFileSync(
      join(RUNS_DIR, `${id}-20260101000000.json`),
      JSON.stringify({ id, ts: '2026-01-01T00:00:00Z', ok: true, cost_usd: '0', steps: { Executando: { time: 5, cost: 0.1, tokens: 10 } } }),
    )
    writeFileSync(join(RUNS_DIR, `${id}.clarify.json`), JSON.stringify([{ q: 'qual caminho?', options: ['a', 'b'], recommended: 'a' }]))
    updateCard(id, { fields: { review_verdict: 'APPROVED', review_reason: 'ok' } })
    updateCard(id, { fields: { status: 'URL' } })
  })

  const eventos: EventoDoMotor[] = []
  for (let i = 0; i < 7; i++) {
    const passo = await it.next()
    expect(passo.done).toBe(false)
    if (!passo.done) eventos.push(passo.value)
  }
  controlador.abort()

  expect(eventos.map(e => e.tipo)).toEqual([
    'saida_de_ferramenta', 'custo', 'passo_iniciado', 'passo_concluido', 'pergunta', 'veredito', 'pausa',
  ])

  const proximo = await it.next()
  expect(proximo.done).toBe(true)
}, 10000)

test('acompanharDoDisco com sinal ja abortado nao yielda nenhum evento, mesmo havendo eventos pendentes em disco', async () => {
  const id = createCard({ title: 'ja-abortado', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\nja-abortado\n')
  writeFileSync(liveLogPath(id), '— concluido (custo $0.5000) —\n')

  const controlador = new AbortController()
  controlador.abort()
  const it = acompanharDoDisco(id, { signal: controlador.signal })

  const primeiro = await it.next()
  expect(primeiro.done).toBe(true)
  expect(primeiro.value).toBeUndefined()
})

test('acompanharDoDisco emite "fim" com resultado e custo quando o card ja nasce em status terminal', async () => {
  const id = createCard(
    { title: 'terminal', status: 'HALTED', repo: 'org/app', cost_usd: '1.5000' },
    '## Objetivo\nterminal\n',
  )

  const controlador = new AbortController()
  const it = acompanharDoDisco(id, { signal: controlador.signal })
  const eventos = await drenarEAbortarAoFim(it, controlador, 1)

  expect(eventos).toHaveLength(1)
  const [fim] = eventos
  expect(fim?.tipo).toBe('fim')
  if (fim?.tipo === 'fim') {
    expect(fim.resultado).toBe('falha')
    expect(fim.custoUsd).toBeCloseTo(1.5, 5)
  }

  const proximo = await it.next()
  expect(proximo.done).toBe(true)
})
