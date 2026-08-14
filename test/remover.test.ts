import { test, expect, beforeEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hicode-rm-'))
  mkdirSync(join(dir, 'runs'), { recursive: true })
  process.env.HICODE_CARDS_DIR = dir
})

function card(id: string, fields: Record<string, string>): void {
  const fm = Object.entries({ id, ...fields }).map(([k, v]) => `${k}: ${v}`).join('\n')
  writeFileSync(join(dir, `${id}-x.md`), `---\n${fm}\n---\n## Objetivo\nx\n`)
}

function run(nome: string): void {
  writeFileSync(join(dir, 'runs', nome), '{}')
}

test('plano lista o que sera limpo e nao apaga nada', async () => {
  const { planejarRemocao } = await import('../lib/core/remover')
  card('099', { status: 'READY', title: 'teste', repo: 'org/app', branch: 'hicode/099' })
  run('099.live.log')
  run('099-20260101.json')
  const p = planejarRemocao('099')
  expect(p?.runs.sort()).toEqual(['099-20260101.json', '099.live.log'])
  expect(p?.avisos.join(' ')).toContain('hicode/099')
  expect(existsSync(join(dir, '099-x.md'))).toBe(true)
})

test('remove o card e SO os arquivos dele', async () => {
  const { remover } = await import('../lib/core/remover')
  card('099', { status: 'READY', title: 'x', repo: 'org/app' })
  run('099.live.log')
  run('098-outro.json')
  const r = await remover('099')
  expect(r.ok).toBe(true)
  expect(existsSync(join(dir, '099-x.md'))).toBe(false)
  expect(readdirSync(join(dir, 'runs'))).toEqual(['098-outro.json'])
})

test('RECUSA apagar card em voo — o motor esta gastando nele', async () => {
  const { remover } = await import('../lib/core/remover')
  for (const status of ['EXECUTING', 'CORRECTING']) {
    card('100', { status, title: 'x', repo: 'org/app' })
    const r = await remover('100')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('/halt')
    expect(existsSync(join(dir, '100-x.md'))).toBe(true)
  }
})

test('force apaga o card em voo', async () => {
  const { remover } = await import('../lib/core/remover')
  card('100', { status: 'EXECUTING', title: 'x', repo: 'org/app' })
  expect((await remover('100', true)).ok).toBe(true)
})

test('PR aberto avisa que o PR nao fecha sozinho', async () => {
  const { planejarRemocao } = await import('../lib/core/remover')
  card('101', { status: 'PR_OPEN', title: 'x', repo: 'org/app' })
  expect(planejarRemocao('101')?.avisos.join(' ')).toContain('PR continua aberto')
})

test('card inexistente nao explode', async () => {
  const { planejarRemocao, remover } = await import('../lib/core/remover')
  expect(planejarRemocao('777')).toBe(null)
  expect((await remover('777')).ok).toBe(false)
})

test('id sem zero a esquerda acha o card', async () => {
  const { planejarRemocao } = await import('../lib/core/remover')
  card('099', { status: 'READY', title: 'x', repo: 'org/app' })
  expect(planejarRemocao('99')?.id).toBe('99')
})
