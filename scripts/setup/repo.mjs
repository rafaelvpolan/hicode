#!/usr/bin/env bun
import { addRepo, removeRepo, repoStatus } from '../../lib/core/repos.ts'

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const OK = '\x1b[32m'
const BAD = '\x1b[31m'
const tty = process.stdout.isTTY === true
const paint = (s, c) => (tty ? `${c}${s}${RESET}` : s)
const out = (s = '') => process.stdout.write(s + '\n')
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z')

function flag(argv, name) {
  const i = argv.indexOf(`--${name}`)
  if (i >= 0 && argv[i + 1]) return argv[i + 1]
  const inline = argv.find((a) => a.startsWith(`--${name}=`))
  return inline ? inline.slice(name.length + 3) : ''
}

function uso(code) {
  out('')
  out('  hii repo add <owner/nome> [--path <dir>] [--branch <base>] [--url <git>]')
  out('  hii repo rm  <owner/nome>')
  out('  hii repo ls')
  out('')
  out(paint('  sem --path, procura o clone irmao deste repo (../<nome>)', DIM))
  out(paint('  add valida o clone, provisiona .hii/ e gera o contrato (0 token)', DIM))
  out('')
  process.exit(code)
}

const [sub, alvo] = process.argv.slice(2)
const argv = process.argv.slice(2)

if (!sub || sub === 'help' || sub === '--help') uso(sub ? 0 : 1)

if (sub === 'ls' || sub === 'list') {
  const repos = repoStatus()
  if (!repos.length) {
    out(paint('\n  nenhum repo-alvo registrado — use `hii repo add <owner/nome>`\n', DIM))
    process.exit(0)
  }
  out('')
  for (const r of repos) {
    const marca = r.cloneOk && r.gitOk ? paint('ok  ', OK) : paint('erro', BAD)
    out(`  ${marca} ${r.name.padEnd(32)} ${paint(r.branch.padEnd(10), DIM)} ${r.path}`)
    if (!r.cloneOk) out(paint(`       clone ausente`, BAD))
    else if (!r.gitOk) out(paint(`       existe mas nao e repositorio git`, BAD))
    else if (!r.contractOk) out(paint(`       sem contrato — rode: hii contract ${r.path}`, DIM))
  }
  out('')
  process.exit(0)
}

if (sub === 'rm' || sub === 'remove') {
  if (!alvo) uso(1)
  const r = removeRepo(alvo)
  out(r.ok ? `\n  "${alvo}" removido do registro ${paint('(o clone local nao foi tocado)', DIM)}\n` : `\n  ${paint(r.error, BAD)}\n`)
  process.exit(r.ok ? 0 : 1)
}

if (sub !== 'add') uso(1)
if (!alvo) uso(1)

const r = addRepo({ name: alvo, path: flag(argv, 'path'), branch: flag(argv, 'branch'), url: flag(argv, 'url') }, now())

if (!r.ok) {
  out(`\n  ${paint(r.error, BAD)}\n`)
  process.exit(1)
}

const pad = (s) => String(s).padEnd(12)
out('')
out(`  ${paint('registrado', OK)} ${r.repo.name}`)
out(`  ${pad('path')} ${r.repo.path}`)
out(`  ${pad('branch')} ${r.repo.branch}`)
if (r.repo.url) out(`  ${pad('url')} ${r.repo.url}`)
if (r.provisioned?.length) {
  out('')
  out(paint('  .hii/ provisionado:', DIM))
  for (const p of r.provisioned) out(paint(`    + ${p}`, DIM))
}
out('')
out(`  ${pad('stack')} ${r.contract.stack}`)
out(`  ${pad('build')} ${r.contract.commands.build || paint('(sem script)', DIM)}`)
out(`  ${pad('test')} ${r.contract.commands.test || paint('(sem script)', DIM)}`)
out(`  ${pad('dev')} ${r.contract.commands.dev || paint('(sem script)', DIM)}`)
out('')
out(paint('  pronto — `hii` para criar a primeira tarefa', DIM))
out('')
