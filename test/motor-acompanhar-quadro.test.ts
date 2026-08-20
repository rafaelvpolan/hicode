import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-motor-acompanhar-quadro-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
const RUNS_DIR = join(process.env.HICODE_CARDS_DIR, 'runs')
mkdirSync(RUNS_DIR, { recursive: true })

const { createCard, updateCard } = await import('../panel/server/card')
const { acompanharQuadro } = await import('../panel/server/motor/quadro')
import type { EventoDoQuadro } from '../panel/server/motor/types'

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

function liveLogPath(id: string): string {
  return join(RUNS_DIR, `${id}.live.log`)
}

function depoisDaVoltaAtual(escreverFixture: () => void): void {
  setTimeout(escreverFixture, 0)
}

async function proximosN(it: AsyncGenerator<EventoDoQuadro>, n: number): Promise<EventoDoQuadro[]> {
  const eventos: EventoDoQuadro[] = []
  for (let i = 0; i < n; i++) {
    const passo = await it.next()
    expect(passo.done, `esperava mais um evento (recebi ${eventos.length} de ${n})`).toBe(false)
    if (!passo.done) eventos.push(passo.value)
  }
  return eventos
}

test('acompanharQuadro mistura eventos de dois cards num fluxo so, cada um com o cardId certo, mais um evento de daemon com cardId vazio', async () => {
  const a = createCard({ title: 'card a', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\na\n')
  const b = createCard({ title: 'card b', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\nb\n')

  const controlador = new AbortController()
  const it = acompanharQuadro({ signal: controlador.signal })

  const bootstrap = await it.next()
  expect(bootstrap.done, 'a primeira leitura devia trazer o evento de daemon (baseline de cada card)').toBe(false)
  if (!bootstrap.done) {
    expect(bootstrap.value.tipo).toBe('daemon')
    expect(bootstrap.value.cardId).toBe('')
  }

  depoisDaVoltaAtual(() => {
    writeFileSync(liveLogPath(a), '— concluido (custo $0.1000) —\n')
    writeFileSync(liveLogPath(b), '— concluido (custo $0.2000) —\n')
  })

  const primeiraLeva = await proximosN(it, 2)

  const deA = primeiraLeva.filter(e => e.cardId === a)
  const deB = primeiraLeva.filter(e => e.cardId === b)
  expect(deA.map(e => e.tipo)).toEqual(['custo'])
  expect(deB.map(e => e.tipo)).toEqual(['custo'])

  depoisDaVoltaAtual(() => {
    appendFileSync(liveLogPath(a), '— concluido (custo $0.3000) —\n')
    updateCard(b, { fields: { status: 'URL' } })
  })

  const segundaLeva = await proximosN(it, 3)
  controlador.abort()

  const aDeNovo = segundaLeva.filter(e => e.cardId === a)
  const bDeNovo = segundaLeva.filter(e => e.cardId === b)
  const daemonDeNovo = segundaLeva.filter(e => e.tipo === 'daemon')
  expect(aDeNovo.map(e => e.tipo)).toEqual(['custo'])
  expect(bDeNovo.map(e => e.tipo)).toEqual(['pausa', 'status'])
  expect(daemonDeNovo, 'daemon sem mudanca nao devia gerar novo evento').toHaveLength(0)

  const status = bDeNovo.find(e => e.tipo === 'status')
  if (status?.tipo === 'status') {
    expect(status.statusAnterior).toBe('EXECUTING')
    expect(status.status).toBe('URL')
  }

  const proximo = await it.next()
  expect(proximo.done).toBe(true)
}, 10000)

test('acompanharQuadro com sinal ja abortado encerra sem emitir nenhum evento, mesmo com cards e eventos pendentes', async () => {
  const id = createCard({ title: 'ja-abortado', status: 'EXECUTING', repo: 'org/app' }, '## Objetivo\nja-abortado\n')
  writeFileSync(liveLogPath(id), '— concluido (custo $0.5000) —\n')

  const controlador = new AbortController()
  controlador.abort()
  const it = acompanharQuadro({ signal: controlador.signal })

  const primeiro = await it.next()
  expect(primeiro.done).toBe(true)
})
