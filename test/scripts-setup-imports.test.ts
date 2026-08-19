import { test, expect } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const SETUP_DIR = join(import.meta.dir, '..', 'scripts', 'setup')

function scriptsDeSetup(): string[] {
  return readdirSync(SETUP_DIR).filter(f => f.endsWith('.mjs')).sort()
}

interface ResolucaoDeImports {
  status: number
  stderr: string
}

function resolveImportsSemExecutar(nome: string): ResolucaoDeImports {
  const r = spawnSync('bun', ['build', join(SETUP_DIR, nome), '--target=bun'], { encoding: 'utf8' })
  return { status: r.status ?? -1, stderr: r.stderr }
}

test('scripts/setup/ tem pelo menos os scripts que bin/hii.ts dispara por caminho', () => {
  const DISPARADOS_POR_HII_TS = ['archive.mjs', 'board.mjs', 'card.mjs', 'contract.mjs', 'doctor.mjs', 'repo.mjs', 'rm.mjs', 'teclas.mjs', 'wt-shift-enter.mjs']
  const achados = scriptsDeSetup()
  for (const nome of DISPARADOS_POR_HII_TS) expect(achados).toContain(nome)
})

for (const nome of scriptsDeSetup()) {
  test(`scripts/setup/${nome}: todo import resolve (bun build --target=bun, sem executar o script)`, () => {
    const r = resolveImportsSemExecutar(nome)
    expect(r.stderr).not.toContain('Could not resolve')
    expect(r.status).toBe(0)
  })
}
