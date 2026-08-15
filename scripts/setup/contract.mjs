#!/usr/bin/env bun
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { syncContract } from '../../lib/contract/store.ts'

const target = resolve(process.argv[2] ?? process.cwd())
const json = process.argv.includes('--json')

if (!existsSync(target)) {
  process.stderr.write(`repo nao encontrado: ${target}\n`)
  process.exit(2)
}

const { contract, changed, file } = syncContract(target, new Date().toISOString().replace(/\.\d+Z$/, 'Z'))

if (json) {
  process.stdout.write(JSON.stringify(contract, null, 2) + '\n')
  process.exit(0)
}

const pad = (s) => String(s).padEnd(14)
process.stdout.write(`\ncontrato ${changed ? 'atualizado' : 'ja atual'}: ${file}\n\n`)
process.stdout.write(`  ${pad('stack')} ${contract.stack}\n`)
process.stdout.write(`  ${pad('gerenciador')} ${contract.packageManager}\n`)
process.stdout.write(`  ${pad('monorepo')} ${contract.monorepo ? `sim (${contract.packages.length} pacotes)` : 'nao'}\n\n`)
for (const [k, v] of Object.entries(contract.commands)) {
  process.stdout.write(`  ${pad(k)} ${v || '(sem script)'}\n`)
}
if (contract.monorepo) {
  process.stdout.write('\n  pacotes:\n')
  for (const p of contract.packages) {
    const porta = p.devPort ? ` :${p.devPort}` : ''
    process.stdout.write(`    ${pad(p.path || '.')} ${p.name} — ${[p.framework, p.language].filter(Boolean).join(' + ')}${porta}\n`)
  }
}
process.stdout.write(`\n  0 token — deteccao 100% deterministica\n\n`)
