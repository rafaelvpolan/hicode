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
import { renderBoard, renderProjetos, resumirProjetos } from '../lib/core/render/board'
import { startLive } from '../lib/core/watch'
import { cardsDir } from '../lib/runner/config'
import { repoStatus } from '../lib/core/repos'
import { passosDoCard } from '../lib/core/progresso'
import { readRunSteps } from '../lib/runner/runs'
import { activeSteps } from '../lib/runner/pipeline/config'
import { planSteps } from '../lib/runner/analyze'
import { extractObjetivo } from '../lib/card'
import type { Fields } from '../lib/card'
import { daemonStatus, daemonPid, readPrefs, writePrefs } from '../lib/core/daemon'
import { handle, newSession, planShown } from '../lib/core/session'
import { complete } from '../lib/core/complete'
import { createApp } from '../lib/core/tui/app'
import { nodeTerminal } from '../lib/core/tui/screen'
import { STATUSES } from '../lib/card'
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

function projetos(): ReturnType<typeof resumirProjetos> {
  return resumirProjetos(repoStatus().map(r => ({ name: r.name, cloneOk: r.cloneOk })), allCards())
}

async function escolherProjeto(ask: (q: string) => Promise<string | null>): Promise<string> {
  const lista = projetos()
  if (!lista.length) return ''
  if (lista.length === 1) return lista[0]?.name ?? ''
  say('')
  say(renderProjetos(lista, { color }))
  say('')
  for (;;) {
    const r = await ask(color ? `${ACC}projeto› ${RESET}` : 'projeto› ')
    if (r === null) return lista[0]?.name ?? ''
    const t = r.trim()
    if (!t) return lista[0]?.name ?? ''
    const porNumero = lista[Number(t) - 1]
    if (porNumero) return porNumero.name
    const porNome = lista.find(p => p.name === t) ?? lista.find(p => p.name.includes(t))
    if (porNome) return porNome.name
    say(dim('  nao achei esse projeto — numero da lista ou parte do nome'))
  }
}

function passosDe(c: Fields): ReturnType<typeof passosDoCard> {
  const card = readCard(String(c.id ?? ''))
  if (!card) return []
  const objetivo = extractObjetivo(card.body) || card.fm.title
  const plano = planSteps(
    { title: card.fm.title, objetivo, risk: card.fm.risk, surface: card.fm.surface, override: card.fm.steps },
    activeSteps(),
  )
  return passosDoCard(c, plano.steps, readRunSteps(String(c.id ?? '')))
}

function board(state: SessionState): string {
  return renderBoard(allCards(), {
    color, repo: state.repo, daemon: daemonStatus(), passosDe,
    now: Date.now(), width: Number(process.stdout.columns) || 78,
  })
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

function completer(line: string): [string[], string] {
  return complete(line, {
    repos: listRepos().map(r => r.name),
    cards: allCards().map(c => String(c.id ?? '')).filter(Boolean),
    statuses: [...STATUSES],
  })
}

function fleet(state: SessionState): void {
  say('')
  say(renderFleet(allCards().filter(c => !state.repo || c.repo === state.repo), { color, repo: state.repo, daemon: daemonStatus() }))
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
  const status = card.fm.status ?? 'INBOX'
  if (!core.canApprovePlan(status)) {
    say(dim(`  #${id} esta em ${status} — plano exibido so para leitura (aprovar aqui descartaria o trabalho)`))
    return { ...state, pendingPlan: '' }
  }
  say(dim('  enter aprova e enfileira · escreva outra tarefa para descartar · /plan <id> reexibe'))
  return planShown(state, id)
}

function listCards(filtro: string, repo: string): void {
  const wanted = filtro.trim().toUpperCase()
  const cards = allCards()
    .filter(c => !repo || c.repo === repo)
    .filter(c => !wanted || String(c.status ?? '') === wanted)
  if (!cards.length) return say(dim(wanted ? `nenhum card em ${wanted}` : 'nenhum card'))
  for (const c of cards.sort((a, b) => Number(a.id) - Number(b.id))) {
    say(`  ${dim(`#${String(c.id).padStart(3, '0')}`)} ${String(c.status ?? '').padEnd(12)} ${String(c.title ?? '').slice(0, 52)}`)
  }
}

async function boardAoVivo(state: SessionState): Promise<void> {
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

function help(): void {
  say('')
  say('  escreva a tarefa em linguagem natural para criar um card')
  say('')
  say(`  ${'/board'.padEnd(20)} ${dim('quadro do projeto AO VIVO (q volta)')}`)
  say(`  ${'/cards [STATUS]'.padEnd(20)} ${dim('lista, opcionalmente filtrando por estado')}`)
  say(`  ${'/plan <id>'.padEnd(20)} ${dim('reexibe o plano de um card')}`)
  say(`  ${'/watch <id>'.padEnd(20)} ${dim('mostra o log do card')}`)
  say(`  ${'/ok <id>'.padEnd(20)} ${dim('aprova o preview que voce viu no dev server')}`)
  say(`  ${'/no <id> [o que]'.padEnd(20)} ${dim('rejeita o preview; com motivo, pede correcao')}`)
  say(`  ${'/halt <id> [motivo]'.padEnd(20)} ${dim('para um card')}`)
  say(`  ${'/repo'.padEnd(20)} ${dim('troca de projeto (reabre a lista)')}`)
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

async function tui(state0: SessionState): Promise<void> {
  let state = state0
  const term = nodeTerminal()
  let sairPedido = false
  const app = createApp(term, {
    header: () => `hii · ${state.repo || '(sem projeto)'}   daemon ${daemonStatus()}`,
    corpo: () => board(state).split('\n'),
    dica: () => '/help  ctrl+c sai',
    prompt: () => '› ',
    intervalMs: 1500,
    onComplete: (linha) => completer(linha)[0],
    onInterrupt: () => { sairPedido = true; return true },
    onLine: async (linha) => {
      const { effect, state: next } = handle(linha, state)
      state = next
      const diga = (s: string): void => app.log('  ' + s)
      if (effect.kind === 'quit') { sairPedido = true; return }
      if (effect.kind === 'help') { diga('escreva a tarefa · /board /cards /plan /watch /ok /no /halt /repo /quit'); return }
      if (effect.kind === 'error') return diga(effect.text ?? '')
      if (effect.kind === 'cards') {
        const alvo = (effect.text ?? '').trim().toUpperCase()
        const lista = allCards().filter(c => (!state.repo || c.repo === state.repo) && (!alvo || c.status === alvo))
        if (!lista.length) return diga(alvo ? `nenhum card em ${alvo}` : 'nenhum card')
        for (const c of lista) diga(`#${String(c.id).padStart(3, '0')} ${String(c.status).padEnd(12)} ${String(c.title ?? '').slice(0, 46)}`)
        return
      }
      if (effect.kind === 'watch') {
        const card = readCard(effect.id ?? '')
        if (!card) return diga(`card #${effect.id} nao encontrado`)
        for (const l of card.body.split('\n').filter(l => /^\d{4}-/.test(l.trim())).slice(-8)) diga(l.slice(0, 110))
        if (card.fm.preview_url) diga(`preview → ${card.fm.preview_url}`)
        return
      }
      if (effect.kind === 'plan') {
        const card = readCard(effect.id ?? '')
        if (!card) return diga(`card #${effect.id} nao encontrado`)
        const alvo = repoPath(card.fm.repo ?? '')
        const plano = buildPlan({ card, hasDevServer: existsSync(alvo) && hasDevServer(alvo) })
        for (const l of renderPlan(plano, { color: true }).split('\n')) app.log(l)
        const st = card.fm.status ?? 'INBOX'
        if (core.canApprovePlan(st)) { state = planShown(state, effect.id ?? ''); diga('enter aprova e enfileira') }
        else diga(`#${effect.id} esta em ${st} — plano so para leitura`)
        return
      }
      if (effect.kind === 'approve-plan') {
        const r = core.approvePlan(effect.id ?? '')
        return diga(r.ok ? `#${effect.id} aprovado e na fila` : r.reason)
      }
      if (effect.kind === 'approve-preview') {
        const r = core.approvePreview(effect.id ?? '')
        return diga(r.ok ? `#${effect.id} preview aprovado — segue para o polimento` : r.reason)
      }
      if (effect.kind === 'reject-preview') {
        const r = core.rejectPreview(effect.id ?? '', effect.text ?? '')
        return diga(r.ok ? `#${effect.id} ${effect.text ? 'vai corrigir' : 'vai refazer'}` : r.reason)
      }
      if (effect.kind === 'halt') {
        const r = core.halt(effect.id ?? '', effect.text ?? '')
        return diga(r ? `#${effect.id} parado` : `card #${effect.id} nao encontrado`)
      }
      if (effect.kind === 'submit') {
        if (!state.repo) return diga('sem projeto — /repo <owner/nome>')
        const id = core.submit({ title: effect.text ?? '', repo: state.repo })
        diga(`card #${id} criado`)
        const card = readCard(id)
        if (card) {
          const alvo = repoPath(card.fm.repo ?? '')
          for (const l of renderPlan(buildPlan({ card, hasDevServer: existsSync(alvo) && hasDevServer(alvo) }), { color: true }).split('\n')) app.log(l)
          state = planShown(state, id)
          diga('enter aprova e enfileira · outra tarefa descarta')
        }
        return
      }
    },
  })
  await app.run()
  if (sairPedido) say(dim('  sessao encerrada — os cards seguem rodando'))
}

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, completer })
  const lines = rl[Symbol.asyncIterator]()
  const ask = async (q: string): Promise<string | null> => {
    process.stdout.write(q)
    const { value, done } = await lines.next()
    return done ? null : String(value)
  }
  say('')
  say(`  ${color ? ACC : ''}hicode${color ? RESET : ''} — motor de tarefas   ${dim('/help para os comandos')}`)
  await ensureDaemon(ask)
  let state = newSession(await escolherProjeto(ask))
  avisoRepos(state)
  if (color) {
    rl.close()
    await tui(state)
    return
  }
  fleet(state)

  for (;;) {
    const line = await ask(color ? `${ACC}› ${RESET}` : '› ')
    if (line === null) break
    const { effect, state: next } = handle(line, state)
    state = next
    if (effect.kind === 'quit') break
    if (effect.kind === 'help') help()
    else if (effect.kind === 'board') await boardAoVivo(state)
    else if (effect.kind === 'cards') listCards(effect.text ?? '', state.repo)
    else if (effect.kind === 'watch') watch(effect.id ?? '')
    else if (effect.kind === 'plan') state = showPlan(effect.id ?? '', state)
    else if (effect.kind === 'reopen-repo') {
      state = { ...state, repo: await escolherProjeto(ask) }
      fleet(state)
    } else if (effect.kind === 'error') say(dim('  ' + (effect.text ?? '')))
    else if (effect.kind === 'approve-preview') {
      const r = core.approvePreview(effect.id ?? '')
      say(dim(r.ok ? `  #${effect.id} preview aprovado — segue para o polimento` : `  ${r.reason}`))
      if (r.ok) fleet(state)
    } else if (effect.kind === 'reject-preview') {
      const motivo = effect.text ?? ''
      const r = core.rejectPreview(effect.id ?? '', motivo)
      say(dim(r.ok ? `  #${effect.id} ${motivo ? 'vai corrigir: ' + motivo : 'vai refazer'}` : `  ${r.reason}`))
      if (r.ok) fleet(state)
    } else if (effect.kind === 'halt') {
      const r = core.halt(effect.id ?? '', effect.text ?? '')
      say(dim(r ? `  #${effect.id} parado` : `  card #${effect.id} nao encontrado`))
    } else if (effect.kind === 'submit') {
      if (!state.repo) { say(dim('  defina o repo-alvo primeiro: /repo <owner/nome>')); continue }
      const id = core.submit({ title: effect.text ?? '', repo: state.repo })
      say(dim(`  card #${id} criado`))
      state = showPlan(id, state)
    } else if (effect.kind === 'approve-plan') {
      const r = core.approvePlan(effect.id ?? '')
      say(dim(r.ok ? `  #${effect.id} aprovado e na fila` : `  ${r.reason}`))
      if (r.ok && !daemonPid()) say(dim('  daemon offline — vai rodar quando voce subir com `hii start`'))
      if (r.ok) fleet(state)
    }
  }
  rl.close()
  say(dim('  sessao encerrada — os cards seguem rodando'))
}

await main()
