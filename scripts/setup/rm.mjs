import { planejarLote, removerLote } from '../../lib/core/remover.ts'

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

out('')
for (const a of lote.ausentes) out(dim(`  #${a} nao encontrado`))
if (!force) for (const b of lote.bloqueados) out(dim(`  #${b.id} fica — ${b.bloqueio}`))
if (!alvos.length) {
  out(dim('  nada a apagar'))
  out('')
  process.exit(1)
}
for (const p of alvos) {
  out(`  #${p.id} ${p.status}  ${p.titulo.slice(0, 50)}`)
  if (p.worktree) out(dim(`    worktree  ${p.worktree}`))
  if (p.previewPid) out(dim(`    preview   pid ${p.previewPid}`))
  if (p.runs.length) out(dim(`    execucao  ${p.runs.length} arquivo(s)`))
}
for (const a of [...new Set(alvos.flatMap((p) => p.avisos))]) out(dim(`  ${a}`))
out('')

if (!sim) {
  out(dim(`  nada foi apagado — repita com --yes para apagar ${alvos.length} card(s)`))
  out('')
  process.exit(0)
}

const r = await removerLote(alvos.map((p) => p.id), force)
if (r.apagados.length) out(`  ${r.apagados.length} card(s) apagado(s): ${r.apagados.map((x) => '#' + x).join(' ')}`)
for (const f of r.falhas) out(dim(`  #${f.id}: ${f.reason}`))
out('')
process.exit(r.falhas.length ? 1 : 0)
