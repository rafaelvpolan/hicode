#!/usr/bin/env bun
import { runDoctor } from '../../lib/core/doctor.ts'

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const OK = '\x1b[32m'
const WARN = '\x1b[33m'
const BAD = '\x1b[31m'
const tty = process.stdout.isTTY === true
const paint = (s, c) => (tty ? `${c}${s}${RESET}` : s)
const out = (s = '') => process.stdout.write(s + '\n')

const MARCA = {
  ok: () => paint('ok  ', OK),
  aviso: () => paint('!   ', WARN),
  erro: () => paint('ERRO', BAD),
}

function linha(c) {
  out(`  ${MARCA[c.severidade]()} ${c.nome.padEnd(12)} ${c.detalhe}`)
  if (c.conserto) out(`       ${paint('→ ' + c.conserto, DIM)}`)
}

const r = runDoctor()

out('')
for (const c of r.gerais) linha(c)

for (const repo of r.repos) {
  out('')
  out(`  ${paint(repo.repo, DIM)}`)
  for (const c of repo.checks) linha(c)
}

if (!r.repos.length) {
  out('')
  out(paint('  nenhum repo-alvo registrado — hii repo add <owner/nome>', DIM))
}

out('')
if (r.pior === 'erro') {
  out(paint('  ha erro que impede o card de chegar ao PR — conserte antes de gastar token', BAD))
  out('')
  process.exit(1)
}
out(paint(r.pior === 'aviso' ? '  da para rodar, com ressalvas acima' : '  tudo pronto', r.pior === 'aviso' ? WARN : OK))
out('')
