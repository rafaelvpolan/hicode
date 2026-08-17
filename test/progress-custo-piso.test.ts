import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ANTERIOR = process.env.HICODE_CARDS_DIR
const BASE = mkdtempSync(join(tmpdir(), 'hicode-progresso-piso-'))
process.env.HICODE_CARDS_DIR = BASE
mkdirSync(join(BASE, 'runs'), { recursive: true })

const { renderProgress } = await import('../lib/runner/progress')

afterAll(() => {
  if (ANTERIOR === undefined) delete process.env.HICODE_CARDS_DIR
  else process.env.HICODE_CARDS_DIR = ANTERIOR
  rmSync(BASE, { recursive: true, force: true })
})

function card(id: string, fields: Record<string, string>): void {
  const fm = Object.entries({ id, ...fields }).map(([k, v]) => `${k}: ${v}`).join('\n')
  writeFileSync(join(BASE, `${id}-x.md`), `---\n${fm}\n---\n## Objetivo\nx\n`)
}

test('hii status: card sem reporte de gasto mostra o custo como piso; o medido continua afirmativo', () => {
  card('020', { status: 'EXECUTING', title: 'com piso', repo: 'org/app', cost_usd: '0.7726', cost_floor: 'codex' })
  card('021', { status: 'EXECUTING', title: 'medido', repo: 'org/app', cost_usd: '1.0000' })
  const t = renderProgress()
  expect(t).toContain('≥$0.7726')
  expect(t).toContain('$1.0000')
  expect(t).not.toContain('≥$1.0000')
})

test('hii status: card antigo so com cost_unverified tambem sai como piso', () => {
  card('022', { status: 'EXECUTING', title: 'antigo', repo: 'org/app', cost_usd: '2.0000', cost_unverified: 'claude' })
  expect(renderProgress()).toContain('≥$2.0000')
})
