import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { ROOT, cardsDir } from '../../lib/runner/config'
import { renderFleet } from '../../lib/core/render/fleet'
import { startLive } from '../../lib/core/watch'
import { daemonPid, daemonStatus, readPrefs, writePrefs } from '../../lib/core/daemon'
import type { SessionState } from '../../lib/core/session'
import { DIM, RESET, color, dim, say } from './saida'
import { todosOsCards } from './dados'
import { board } from './board-tui'

export function fleet(state: SessionState): void {
  say('')
  say(renderFleet(todosOsCards().filter(c => !state.repo || c.repo === state.repo), { color, repo: state.repo, daemon: daemonStatus() }))
  say('')
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
