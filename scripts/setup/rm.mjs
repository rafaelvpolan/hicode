import { planejarLote, removerLote } from '../../lib/core/remover.ts'
import { renderRemocao, renderResultado } from '../../lib/core/render/remocao.ts'

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const color = process.stdout.isTTY && !process.env.NO_COLOR
const out = (s) => process.stdout.write(s + '\n')
const dim = (s) => (color ? DIM + s + RESET : s)

const args = process.argv.slice(2)
const force = args.includes('--force') || args.includes('-f')
const sim = args.includes('--yes') || args.includes('-y')
const ids = args.filter((a) => !a.startsWith('-'))

if (!ids.length) {
  out('')
  out('  uso: hii rm <id> [id...] [--force] [--yes]')
  out(dim('  apaga o card e limpa worktree, preview e arquivos de execucao'))
  out('')
  process.exit(1)
}

const lote = planejarLote(ids)
const alvos = force ? [...lote.removiveis, ...lote.bloqueados] : lote.removiveis
const largura = Number(process.stdout.columns) || 78

for (const linha of renderRemocao(lote, force, { color, width: largura, confirmacao: false })) out(linha)

if (!alvos.length) process.exit(1)

if (!sim) {
  out(dim(`  nada foi apagado — repita com --yes para apagar ${alvos.length} tarefa(s)`))
  out('')
  process.exit(0)
}

const r = await removerLote(alvos.map((p) => p.id), force)
for (const linha of renderResultado(r.apagados, r.falhas, { color, width: largura })) out(linha)
out('')
process.exit(r.falhas.length ? 1 : 0)
