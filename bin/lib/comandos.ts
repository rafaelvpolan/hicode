import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, cardsDir } from '../../lib/runner/config'
import { readCard, repoPath } from '../../lib/runner/card-store'
import { hasDevServer } from '../../lib/runner/preview'
import * as core from '../../lib/core/actions'
import { buildPlan } from '../../lib/core/plan'
import { renderPlan } from '../../lib/core/render/plan'
import { renderFleet } from '../../lib/core/render/fleet'
import { startLive } from '../../lib/core/watch'
import { daemonPid, daemonStatus, readPrefs, writePrefs } from '../../lib/core/daemon'
import { planShown } from '../../lib/core/session'
import type { SessionState } from '../../lib/core/session'
import { DIM, RESET, color, dim, say } from './saida'
import { todosOsCards } from './dados'
import { board } from './board-tui'

export function fleet(state: SessionState): void {
  say('')
  say(renderFleet(todosOsCards().filter(c => !state.repo || c.repo === state.repo), { color, repo: state.repo, daemon: daemonStatus() }))
  say('')
}

export function showPlan(id: string, state: SessionState): SessionState {
  const card = readCard(id)
  if (!card) {
    say(dim(`card #${id} nao encontrado`))
    return state
  }
  const target = repoPath(card.fm.repo ?? '')
  const plan = buildPlan({ card, hasDevServer: existsSync(target) && hasDevServer(target) })
  say('')
  say(renderPlan(plan, { color }))
  say('')
  const status = card.fm.status ?? 'INBOX'
  if (!core.canApprovePlan(status)) {
    say(dim(`  #${id} esta em ${status} — plano exibido so para leitura (aprovar aqui descartaria o trabalho)`))
    return { ...state, pendingPlan: '' }
  }
  say(dim('  enter aprova e enfileira · escreva outra tarefa para descartar · /plan <id> reexibe'))
  return planShown(state, id)
}

export function listCards(filtro: string, repo: string): void {
  const wanted = filtro.trim().toUpperCase()
  const cards = todosOsCards()
    .filter(c => !repo || c.repo === repo)
    .filter(c => !wanted || String(c.status ?? '') === wanted)
  if (!cards.length) return say(dim(wanted ? `nenhum card em ${wanted}` : 'nenhum card'))
  for (const c of cards.sort((a, b) => Number(a.id) - Number(b.id))) {
    say(`  ${dim(`#${String(c.id).padStart(3, '0')}`)} ${String(c.status ?? '').padEnd(12)} ${String(c.title ?? '').slice(0, 52)}`)
  }
}

export async function boardAoVivo(state: SessionState): Promise<void> {
  if (!color) {
    say('\n' + board(state) + '\n')
    return
  }
  await new Promise<void>((resolve) => {
    const sessao = startLive({
      dir: cardsDir(),
      intervalMs: 1000,
      render: () => `${board(state)}\n\n  ${DIM}q ou esc volta ao prompt · atualiza sozinho${RESET}`,
      write: (s) => process.stdout.write(s),
    }, resolve)
    const stdin = process.stdin
    const antes = stdin.isRaw === true
    stdin.setRawMode?.(true)
    stdin.resume()
    const onKey = (buf: Buffer): void => {
      const k = buf.toString()
      if (k === 'q' || k === '\x1b' || k === '\x03') {
        stdin.off('data', onKey)
        stdin.setRawMode?.(antes)
        sessao.stop()
      }
    }
    stdin.on('data', onKey)
  })
}

export function watch(id: string): void {
  const card = readCard(id)
  if (!card) return say(dim(`card #${id} nao encontrado`))
  const linhas = card.body.split('\n').filter(l => /^\d{4}-/.test(l.trim())).slice(-12)
  say('')
  say(dim(`  #${id} · ${card.fm.status} · ${card.fm.title ?? ''}`))
  for (const l of linhas) say('  ' + l)
  if (card.fm.preview_url) say(dim(`  preview → ${card.fm.preview_url}`))
  say('')
}

export async function ensureDaemon(ask: (q: string) => Promise<string | null>): Promise<void> {
  if (daemonPid()) return
  const prefs = readPrefs()
  if (prefs.autostart === 'no') {
    say(dim('  daemon offline — os cards ficam na fila ate voce rodar `hii start`'))
    return
  }
  if (prefs.autostart === 'yes') return start()
  if (!color) {
    say(dim('  daemon offline (sem tty: nao pergunto) — suba com `hii start`'))
    return
  }
  const r = await ask('  daemon offline. subir agora? [s/N/sempre/nunca] ')
  const a = (r ?? '').trim().toLowerCase()
  if (a === 'sempre') { writePrefs({ autostart: 'yes' }); return start() }
  if (a === 'nunca') { writePrefs({ autostart: 'no' }); return }
  if (a === 's' || a === 'sim' || a === 'y') return start()
  say(dim('  seguindo com o daemon offline'))
}

export function start(): void {
  const sh = join(ROOT, 'scripts', 'runner-daemon.sh')
  spawnSync(sh, ['start'], { stdio: 'inherit' })
}
