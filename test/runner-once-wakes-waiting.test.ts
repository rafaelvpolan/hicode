import { test, expect, afterAll } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = join(import.meta.dir, '..')
const RUNNER = join(ROOT, 'runner.ts')

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-once-'))
const REPOS = mkdtempSync(join(tmpdir(), 'hicode-once-repos-'))
process.env.HICODE_CARDS_DIR = CARDS

const { createCard, readCard } = await import('../lib/runner/card-store')

afterAll(() => {
  rmSync(CARDS, { recursive: true, force: true })
  rmSync(REPOS, { recursive: true, force: true })
})

function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

function rodarOnce(): void {
  execFileSync('bun', [RUNNER, '--once'], {
    cwd: ROOT,
    env: {
      ...process.env,
      HICODE_CARDS_DIR: CARDS,
      HICODE_REPOS_FILE: join(REPOS, 'repos.json'),
    },
    encoding: 'utf8',
    timeout: 15000,
  })
}

test('REGRESSAO: "runner.ts --once" acorda um card WAITING ja vencido antes de fechar o processo (nao fica esperando o proximo poll que nunca vem)', () => {
  const prazoVencido = isoIn(-60_000)
  const prazoFuturo = isoIn(5 * 60_000)
  const vencido = createCard({
    title: 'tarefa vencida', status: 'WAITING', repo: 'org/repo',
    wait_until: prazoVencido, wait_resume_status: 'PAUSED', wait_provider: '', wait_reason: 'rede indisponivel', wait_attempts: '1',
  }, '## Objetivo\nalgo\n')
  const noPrazo = createCard({
    title: 'tarefa no prazo', status: 'WAITING', repo: 'org/repo',
    wait_until: prazoFuturo, wait_resume_status: 'PAUSED', wait_provider: '', wait_reason: 'rede indisponivel', wait_attempts: '1',
  }, '## Objetivo\nalgo\n')

  rodarOnce()

  const acordado = readCard(vencido)
  expect(acordado?.fm.status).toBe('PAUSED')
  expect(acordado?.fm.wait_until).toBe('')
  expect(acordado?.fm.wait_provider).toBe('')
  expect(acordado?.body).toContain('retomando automaticamente')

  const aindaEsperando = readCard(noPrazo)
  expect(aindaEsperando?.fm.status).toBe('WAITING')
  expect(aindaEsperando?.fm.wait_until).toBe(prazoFuturo)
}, 20000)
