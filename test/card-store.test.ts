import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-cards-'))
process.env.HICODE_CARDS_DIR = CARDS

const { createCard, readCard, patchCard, cardsByStatus, nextId, allCards } = await import('../lib/runner/card-store')

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

function fresh(fields: Record<string, string>, body = '## Objetivo\nfazer algo\n'): string {
  return createCard(fields, body)
}

test('createCard grava no diretorio configurado e readCard le de volta', () => {
  const id = fresh({ title: 'primeiro card', status: 'READY', repo: 'org/repo' })
  const c = readCard(id)
  expect(c).not.toBeNull()
  expect(c?.fm.title).toBe('primeiro card')
  expect(c?.fm.status).toBe('READY')
  expect(readdirSync(CARDS).some(f => f.startsWith(`${id}-`))).toBe(true)
})

test('nextId incrementa a partir do maior id existente', () => {
  const before = Number(nextId())
  fresh({ title: 'mais um', status: 'READY' })
  expect(Number(nextId())).toBe(before + 1)
})

test('patchCard preserva campos nao tocados e adiciona os novos', () => {
  const id = fresh({ title: 'preserva', status: 'READY', repo: 'org/repo', branch: 'hicode/x' })
  patchCard(id, { status: 'EXECUTING', cost_usd: '1.2345' })
  const c = readCard(id)
  expect(c?.fm.status).toBe('EXECUTING')
  expect(c?.fm.cost_usd).toBe('1.2345')
  expect(c?.fm.repo).toBe('org/repo')
  expect(c?.fm.branch).toBe('hicode/x')
  expect(c?.fm.title).toBe('preserva')
})

test('patchCard com logLine acrescenta ao corpo sem perder o objetivo', () => {
  const id = fresh({ title: 'log', status: 'READY' })
  patchCard(id, {}, '2026-08-13T00:00:00Z primeira linha')
  patchCard(id, {}, '2026-08-13T00:00:01Z segunda linha')
  const body = readCard(id)?.body ?? ''
  expect(body).toContain('fazer algo')
  expect(body).toContain('primeira linha')
  expect(body).toContain('segunda linha')
})

test('patchCard em card inexistente e no-op, nao lanca', () => {
  expect(() => patchCard('999', { status: 'HALTED' })).not.toThrow()
  expect(readCard('999')).toBeNull()
})

test('cardsByStatus filtra pelo status corrente', () => {
  const a = fresh({ title: 'fila a', status: 'READY' })
  const b = fresh({ title: 'fila b', status: 'READY' })
  patchCard(b, { status: 'HALTED' })
  const ready = cardsByStatus('READY').map(c => c.id)
  expect(ready).toContain(a)
  expect(ready).not.toContain(b)
  expect(cardsByStatus('HALTED').map(c => c.id)).toContain(b)
})

test('allCards ignora arquivo sem id no frontmatter', () => {
  writeFileSync(join(CARDS, 'zzz-sem-id.md'), '---\ntitle: orfao\n---\n\ncorpo\n')
  expect(allCards().every(c => !!c.id)).toBe(true)
  expect(allCards().some(c => c.title === 'orfao')).toBe(false)
})

test('patchCard sequencial acumula campos de chamadas distintas', () => {
  const id = fresh({ title: 'acumula', status: 'READY' })
  patchCard(id, { cost_usd: '9.99' })
  patchCard(id, { tokens_total: '4242' })
  const c = readCard(id)
  expect(c?.fm.cost_usd).toBe('9.99')
  expect(c?.fm.tokens_total).toBe('4242')
})

function cardPath(id: string): string {
  return join(CARDS, readdirSync(CARDS).find(f => f.startsWith(`${id}-`)) ?? '')
}

async function racePatchers(id: string, fields: string[], times: number): Promise<void> {
  const script = join(import.meta.dir, 'fixtures', 'patch-loop.ts')
  const barrier = join(CARDS, `.go-${id}`)
  const procs = fields.map(f =>
    Bun.spawn(['bun', script, CARDS, id, f, String(times), barrier], { stdout: 'ignore', stderr: 'ignore' }),
  )
  await Bun.sleep(600)
  writeFileSync(barrier, 'go')
  await Promise.all(procs.map(p => p.exited))
}

test('REGRESSAO corrida entre processos: card sobrevive parseavel a escritores concorrentes', async () => {
  const id = fresh({ title: 'corrida', status: 'READY' })
  await racePatchers(id, ["cost_usd", "tokens_total", "eval_score"], 400)
  const raw = readFileSync(cardPath(id), 'utf8')
  expect(raw.startsWith('---\n')).toBe(true)
  const c = readCard(id)
  expect(c).not.toBeNull()
  expect(c?.fm.title).toBe('corrida')
  expect(c?.fm.status).toBe('READY')
}, 30000)

test('REGRESSAO corrida entre processos: nenhuma linha de log se perde', async () => {
  const id = fresh({ title: 'sem perda', status: 'READY' })
  const fields = ['cost_usd', 'tokens_total', 'eval_score']
  const times = 400
  await racePatchers(id, fields, times)
  const body = readCard(id)?.body ?? ''
  const escritas = fields.reduce((n, f) => n + (body.match(new RegExp(`${f} passo `, 'g'))?.length ?? 0), 0)
  expect(escritas).toBe(fields.length * times)
}, 30000)

async function raceIncrementers(script: string, id: string, procs: number, times: number): Promise<void> {
  const barrier = join(CARDS, `.go-inc-${id}`)
  const filhos = Array.from({ length: procs }, () =>
    Bun.spawn(['bun', script, CARDS, id, 'wait_attempts', String(times), barrier], { stdout: 'ignore', stderr: 'ignore' }),
  )
  await Bun.sleep(600)
  writeFileSync(barrier, 'go')
  await Promise.all(filhos.map(p => p.exited))
}

test('REGRESSAO corrida entre processos: patchCardWith incrementa wait_attempts sem perder contagem (leitura+escrita atomicas dentro do lock)', async () => {
  const id = fresh({ title: 'incremento atomico', status: 'WAITING', wait_attempts: '0' })
  const procs = 4
  const times = 100
  await raceIncrementers(join(import.meta.dir, 'fixtures', 'increment-loop.ts'), id, procs, times)
  expect(Number(readCard(id)?.fm.wait_attempts)).toBe(procs * times)
}, 30000)

test('CONTROLE NEGATIVO: ler-fora-do-lock-e-so-depois-escrever perde incrementos sob concorrencia (prova que o padrao atomico acima nao e coincidencia)', async () => {
  const id = fresh({ title: 'incremento sem lock', status: 'WAITING', wait_attempts: '0' })
  const procs = 4
  const times = 100
  await raceIncrementers(join(import.meta.dir, 'fixtures', 'increment-loop-broken.ts'), id, procs, times)
  expect(Number(readCard(id)?.fm.wait_attempts)).toBeLessThan(procs * times)
}, 30000)
