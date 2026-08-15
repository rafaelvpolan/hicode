#!/usr/bin/env bun
import { arquivar, planejar, listarArquivados, restaurar, MAX_CARDS, archiveDir } from '../../lib/core/archive.ts'

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const WARN = '\x1b[33m'
const OK = '\x1b[32m'
const tty = process.stdout.isTTY === true
const paint = (s, c) => (tty ? `${c}${s}${RESET}` : s)
const out = (s = '') => process.stdout.write(s + '\n')

function flag(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : ''
}

const limite = Number(flag('limit')) || MAX_CARDS
const [sub, arg] = process.argv.slice(2).filter((a) => !a.startsWith('--') && a !== String(limite))

if (sub === 'ls' || sub === 'list') {
  const arquivos = listarArquivados()
  out('')
  if (!arquivos.length) out(paint(`  nada arquivado em ${archiveDir()}`, DIM))
  else {
    out(paint(`  ${arquivos.length} card(s) em ${archiveDir()}`, DIM))
    out('')
    for (const f of arquivos) out(`    ${f.replace(/\.md$/, '')}`)
  }
  out('')
  process.exit(0)
}

if (sub === 'restore') {
  if (!arg) {
    out(paint('\n  uso: hii archive restore <id>\n', DIM))
    process.exit(1)
  }
  const ok = restaurar(arg)
  out(ok ? `\n  #${arg} restaurado\n` : `\n  ${paint(`nao achei #${arg} no arquivo (ou ja existe um card ativo com esse id)`, WARN)}\n`)
  process.exit(ok ? 0 : 1)
}

const seco = process.argv.includes('--dry-run')
const plano = planejar(limite)

out('')
out(paint(`  teto: ${limite} card(s) por projeto`, DIM))
out('')
for (const p of plano) {
  const restam = p.total - p.movidos.length
  const marca = p.movidos.length ? paint(`arquiva ${p.movidos.length}`, OK) : paint('nada a fazer', DIM)
  out(`  ${(p.repo || '(sem repo)').padEnd(34)} ${String(p.total).padStart(2)} → ${String(restam).padStart(2)}   ${marca}`)
  if (p.acimaDoTeto) {
    out(paint(`     ${p.acimaDoTeto} acima do teto ainda em andamento — nao arquivo card vivo`, WARN))
  }
}

if (seco) {
  out('')
  out(paint('  --dry-run: nada foi movido', DIM))
  out('')
  process.exit(0)
}

const r = arquivar(limite)
out('')
if (!r.movidos.length) out(paint('  nada a arquivar', DIM))
else {
  for (const m of r.movidos) out(`  ${paint('→', DIM)} #${m.id} ${m.status.padEnd(9)} ${m.title.slice(0, 48)}`)
  out('')
  out(paint(`  ${r.movidos.length} movido(s) para ${archiveDir()} — 'hii archive restore <id>' traz de volta`, DIM))
}
out('')
