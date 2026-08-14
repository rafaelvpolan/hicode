import { renderBoard, resumirProjetos, renderProjetos } from '../../lib/core/render/board.ts'
import { passosDoCard } from '../../lib/core/progresso.ts'
import { allCards, listRepos } from '../../lib/runner/card-store.ts'
import { activeSteps } from '../../lib/runner/pipeline/config.ts'
import { readRunSteps } from '../../lib/runner/runs.ts'
import { planSteps } from '../../lib/runner/analyze.ts'
import { readCard } from '../../lib/runner/card-store.ts'
import { extractObjetivo } from '../../lib/card/index.ts'
import { daemonStatus } from '../../lib/core/daemon.ts'

const args = process.argv.slice(2)
const watch = args.includes('--watch') || args.includes('-w')
const repo = args.find((a) => !a.startsWith('-')) ?? ''
const color = process.stdout.isTTY && !process.env.NO_COLOR
const width = Number(process.stdout.columns) || 78

const passosDe = (c) => {
  const card = readCard(String(c.id ?? ''))
  if (!card) return []
  const objetivo = extractObjetivo(card.body) || card.fm.title
  const plano = planSteps(
    { title: card.fm.title, objetivo, risk: card.fm.risk, surface: card.fm.surface, override: card.fm.steps },
    activeSteps(),
  )
  return passosDoCard(c, plano.steps, readRunSteps(String(c.id ?? '')))
}

function pintar() {
  const cards = allCards()
  if (!repo) {
    const repos = listRepos()
    if (repos.length > 1) {
      return renderProjetos(resumirProjetos(repos, cards), { color }) +
        '\n\n' + renderBoard(cards, { color, daemon: daemonStatus(), passosDe, now: Date.now(), width })
    }
  }
  const alvo = repo || listRepos()[0]?.name || ''
  return renderBoard(cards, { color, repo: alvo, daemon: daemonStatus(), passosDe, now: Date.now(), width })
}

if (!watch) {
  process.stdout.write('\n' + pintar() + '\n\n')
  process.exit(0)
}

const desenhar = () => {
  process.stdout.write('\x1b[H\x1b[2J' + pintar() + '\n')
}
desenhar()
const timer = setInterval(desenhar, 2000)
process.on('SIGINT', () => {
  clearInterval(timer)
  process.stdout.write('\n')
  process.exit(0)
})
