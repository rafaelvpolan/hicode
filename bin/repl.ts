import { createInterface } from 'node:readline'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { ROOT, reposFile } from '../lib/runner/config'
import { allCards, listRepos, readCard, repoPath, repoRegistered } from '../lib/runner/card-store'
import { hasDevServer } from '../lib/runner/preview'
import * as core from '../lib/core/actions'
import { buildPlan } from '../lib/core/plan'
import { renderPlan } from '../lib/core/render/plan'
import { renderFleet } from '../lib/core/render/fleet'
import { renderProgress } from '../lib/runner/progress'
import { daemonStatus, daemonPid, readPrefs, writePrefs } from '../lib/core/daemon'
import { handle, newSession, planShown } from '../lib/core/session'
import type { SessionState } from '../lib/core/session'

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const ACC = '\x1b[36m'
const color = process.stdout.isTTY === true

function say(s: string): void {
  process.stdout.write(s + '\n')
}

function dim(s: string): string {
  return color ? `${DIM}${s}${RESET}` : s
}

function defaultRepo(): string {
  const registrados = listRepos()
  if (registrados.length === 1) return registrados[0]?.name ?? ''
  const recent = allCards().filter(c => c.repo).sort((a, b) => String(b.updated ?? '').localeCompare(String(a.updated ?? '')))
  const escolhido = recent[0]?.repo ?? ''
  return registrados.some(r => r.name === escolhido) ? escolhido : (registrados[0]?.name ?? escolhido)
}

function avisoRepos(state: SessionState): void {
  const registrados = listRepos()
  if (!registrados.length) {
    say(dim(`  nenhum repo-alvo registrado em ${reposFile()}`))
    say(dim('  copie o modelo e ajuste o `path` para o clone local:'))
    say(dim('    cp config/repos.example.json config/repos.json'))
    return
  }
  if (state.repo && !repoRegistered(state.repo)) {
    say(dim(`  atencao: "${state.repo}" nao esta em ${reposFile()} — o card vai parar em HALTED`))
    return
  }
  const alvo = registrados.find(r => r.name === state.repo)
  const caminho = alvo?.path ?? ''
  if (caminho && !existsSync(caminho)) {
    say(dim(`  atencao: o clone de "${state.repo}" nao existe em ${caminho}`))
  } else if (!caminho && !existsSync(repoPath(state.repo))) {
    say(dim(`  atencao: sem "path" no registro e sem clone irmao em ${repoPath(state.repo)}`))
    say(dim('  o card vai parar em HALTED com "repo nao encontrado"'))
  }
}

function fleet(state: SessionState): void {
  say('')
  say(renderFleet(allCards(), { color, repo: state.repo, daemon: daemonStatus() }))
  say('')
}

function showPlan(id: string, state: SessionState): SessionState {
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
  say(dim('  enter aprova e enfileira · escreva outra tarefa para descartar · /plan <id> reexibe'))
  return planShown(state, id)
}

function listCards(filtro: string): void {
  const wanted = filtro.trim().toUpperCase()
  const cards = allCards().filter(c => !wanted || String(c.status ?? '') === wanted)
  if (!cards.length) return say(dim(wanted ? `nenhum card em ${wanted}` : 'nenhum card'))
  for (const c of cards.sort((a, b) => Number(a.id) - Number(b.id))) {
    say(`  ${dim(`#${String(c.id).padStart(3, '0')}`)} ${String(c.status ?? '').padEnd(12)} ${String(c.title ?? '').slice(0, 52)}`)
  }
}

function help(): void {
  say('')
  say('  escreva a tarefa em linguagem natural para criar um card')
  say('')
  say(`  ${'/board'.padEnd(20)} ${dim('quadro completo da frota')}`)
  say(`  ${'/cards [STATUS]'.padEnd(20)} ${dim('lista, opcionalmente filtrando por estado')}`)
  say(`  ${'/plan <id>'.padEnd(20)} ${dim('reexibe o plano de um card')}`)
  say(`  ${'/watch <id>'.padEnd(20)} ${dim('mostra o log do card')}`)
  say(`  ${'/halt <id> [motivo]'.padEnd(20)} ${dim('para um card')}`)
  say(`  ${'/repo [nome]'.padEnd(20)} ${dim('mostra ou troca o repo-alvo')}`)
  say(`  ${'/quit'.padEnd(20)} ${dim('sai (nao derruba o daemon nem os cards)')}`)
  say('')
}

function watch(id: string): void {
  const card = readCard(id)
  if (!card) return say(dim(`card #${id} nao encontrado`))
  const linhas = card.body.split('\n').filter(l => /^\d{4}-/.test(l.trim())).slice(-12)
  say('')
  say(dim(`  #${id} · ${card.fm.status} · ${card.fm.title ?? ''}`))
  for (const l of linhas) say('  ' + l)
  if (card.fm.preview_url) say(dim(`  preview → ${card.fm.preview_url}`))
  say('')
}

async function ensureDaemon(ask: (q: string) => Promise<string | null>): Promise<void> {
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

function start(): void {
  const sh = join(ROOT, 'scripts', 'runner-daemon.sh')
  spawnSync(sh, ['start'], { stdio: 'inherit' })
}

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const lines = rl[Symbol.asyncIterator]()
  const ask = async (q: string): Promise<string | null> => {
    process.stdout.write(q)
    const { value, done } = await lines.next()
    return done ? null : String(value)
  }
  let state = newSession(defaultRepo())

  say('')
  say(`  ${color ? ACC : ''}hicode${color ? RESET : ''} — motor de tarefas   ${dim('/help para os comandos')}`)
  await ensureDaemon(ask)
  avisoRepos(state)
  fleet(state)

  for (;;) {
    const line = await ask(color ? `${ACC}› ${RESET}` : '› ')
    if (line === null) break
    const { effect, state: next } = handle(line, state)
    state = next
    if (effect.kind === 'quit') break
    if (effect.kind === 'help') help()
    else if (effect.kind === 'board') say('\n' + renderProgress() + '\n')
    else if (effect.kind === 'cards') listCards(effect.text ?? '')
    else if (effect.kind === 'watch') watch(effect.id ?? '')
    else if (effect.kind === 'plan') state = showPlan(effect.id ?? '', state)
    else if (effect.kind === 'error') say(dim('  ' + (effect.text ?? '')))
    else if (effect.kind === 'halt') {
      const r = core.halt(effect.id ?? '', effect.text ?? '')
      say(dim(r ? `  #${effect.id} parado` : `  card #${effect.id} nao encontrado`))
    } else if (effect.kind === 'submit') {
      if (!state.repo) { say(dim('  defina o repo-alvo primeiro: /repo <owner/nome>')); continue }
      const id = core.submit({ title: effect.text ?? '', repo: state.repo })
      say(dim(`  card #${id} criado`))
      state = showPlan(id, state)
    } else if (effect.kind === 'approve-plan') {
      const r = core.transition(effect.id ?? '', 'EXECUTING', 'plano aprovado no REPL')
      say(dim(r ? `  #${effect.id} aprovado e na fila` : `  card #${effect.id} nao encontrado`))
      if (r && !daemonPid()) say(dim('  daemon offline — vai rodar quando voce subir com `hii start`'))
      fleet(state)
    }
  }
  rl.close()
  say(dim('  sessao encerrada — os cards seguem rodando'))
}

await main()
