import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-tickdispatch-'))
process.env.HICODE_CARDS_DIR = CARDS
mkdirSync(join(CARDS, 'runs'), { recursive: true })
process.env.HICODE_REPOS_FILE = join(CARDS, 'repos-vazio.json')

const { createCard, readCard } = await import('../lib/runner/card-store')
const { archiveDir } = await import('../lib/core/archive')
const { tick } = await import('../lib/runner/queue')

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

function healthFile(): string {
  return join(CARDS, 'runs', 'daemon-health.json')
}

function readHealth(): { consecutiveFailures: number; lastError: string } {
  return JSON.parse(readFileSync(healthFile(), 'utf8')) as { consecutiveFailures: number; lastError: string }
}

async function aguardarStatus(id: string, statusAlvo: string, tentativas = 60): Promise<void> {
  for (let i = 0; i < tentativas; i++) {
    if (readCard(id)?.fm.status === statusAlvo) return
    await new Promise(r => setTimeout(r, 10))
  }
}

test('REGRESSAO: podar() quebrado de verdade (destino de arquivamento invalido, sem mock) nao impede que um job pendente seja despachado e concluido', async () => {
  for (let i = 0; i < 10; i++) {
    createCard({ title: `card cheio ${i}`, status: 'READY', repo: 'org/repo-poda' }, '## Objetivo\nalgo\n')
  }
  createCard({ title: 'card terminal candidato a arquivamento', status: 'MERGED', repo: 'org/repo-poda' }, '## Objetivo\nalgo\n')
  writeFileSync(archiveDir(), 'isto e um arquivo, nao o diretorio de archive esperado\n')

  const id = createCard({
    title: 'card na fila enquanto o resto do tick falha',
    status: 'EXECUTING',
    repo: 'org/repo-que-nao-existe-neste-teste',
  }, '## Objetivo\nalgo\n')

  tick()
  const healthLogoAposOTick = readHealth()
  await aguardarStatus(id, 'HALTED')

  expect(readCard(id)?.fm.status).toBe('HALTED')
  expect(healthLogoAposOTick.lastError).toContain('podar:')
})
