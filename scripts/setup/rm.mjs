import { planejarRemocao, remover } from '../../lib/core/remover.ts'

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const color = process.stdout.isTTY && !process.env.NO_COLOR
const out = (s) => process.stdout.write(s + '\n')
const dim = (s) => (color ? DIM + s + RESET : s)

const args = process.argv.slice(2)
const force = args.includes('--force') || args.includes('-f')
const sim = args.includes('--yes') || args.includes('-y')
const id = args.find((a) => !a.startsWith('-'))

if (!id) {
  out('')
  out('  uso: hii rm <id> [--force] [--yes]')
  out(dim('  apaga o card e limpa worktree, preview e arquivos de execucao'))
  out('')
  process.exit(1)
}

const plano = planejarRemocao(id)
if (!plano) {
  out(dim(`  card #${id} nao encontrado`))
  process.exit(1)
}
if (plano.bloqueio && !force) {
  out(dim(`  ${plano.bloqueio}`))
  process.exit(1)
}

out('')
out(`  #${plano.id} ${plano.status}  ${plano.titulo.slice(0, 50)}`)
if (plano.worktree) out(dim(`  worktree  ${plano.worktree}`))
if (plano.previewPid) out(dim(`  preview   pid ${plano.previewPid}`))
if (plano.runs.length) out(dim(`  execucao  ${plano.runs.length} arquivo(s)`))
for (const a of plano.avisos) out(dim(`  ${a}`))
out('')

if (!sim) {
  out(dim('  nada foi apagado — repita com --yes para confirmar'))
  out('')
  process.exit(0)
}

const r = await remover(id, force)
out(r.ok ? `  #${id} apagado — ${r.limpou.join(', ')}` : `  ${r.reason}`)
out('')
process.exit(r.ok ? 0 : 1)
