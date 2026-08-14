import { createInterface } from 'node:readline'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { ROOT, reposFile } from '../lib/runner/config'
import { allCards, listRepos, normalizeId, readCard, repoPath, repoRegistered } from '../lib/runner/card-store'
import { hasDevServer, previewPort, httpOk, ensurePreview, waitHttp, stopPreview } from '../lib/runner/preview'
import { PREVIEW_BASE_PORT } from '../lib/runner/config'
import * as core from '../lib/core/actions'
import { buildPlan } from '../lib/core/plan'
import { renderPlan } from '../lib/core/render/plan'
import { renderFleet } from '../lib/core/render/fleet'
import { renderBoard, renderBoardJanela, renderProjetos, resumirProjetos, ordemDoBoard } from '../lib/core/render/board'
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
import { handle, newSession, planShown, respondido, seguir } from '../lib/core/session'
import { dispatch } from '../lib/core/dispatch'
import type { DispatchIO } from '../lib/core/dispatch'
import { cardsPerguntando } from '../lib/core/responder'
import { planejarPreview, inventario, orfaos } from '../lib/core/previews'
import { renderCabecalhoTarefa } from '../lib/core/render/tarefa'
import { subPrompts } from '../lib/core/instruir'
import { complete } from '../lib/core/complete'
import { createApp } from '../lib/core/tui/app'
import { nodeTerminal } from '../lib/core/tui/screen'
import { parseLog, formatar, resumo, ultimoAgente } from '../lib/core/activity'
import { linhaPropriedades, linhasExecucao, emExecucao, linhasEspera, esperandoVoce } from '../lib/core/render/rodape'
import { providerNameFor, modelFor } from '../lib/ai/registry'
import { readFileSync } from 'node:fs'
import { STATUSES } from '../lib/card'
import type { SessionState } from '../lib/core/session'
import type { ModoNavegacao } from '../lib/core/tui/input'

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

function atividadeDe(id: string): ReturnType<typeof parseLog> {
  try {
    return parseLog(readFileSync(join(cardsDir(), 'runs', `${normalizeId(id)}.live.log`), 'utf8'))
  } catch {
    return []
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

function planoDe(id: string, ativo = false, subindo = false): string {
  const card = readCard(id)
  if (!card) return ''
  const alvo = repoPath(card.fm.repo ?? '')
  const temDev = existsSync(alvo) && hasDevServer(alvo)
  const plano = buildPlan({
    card,
    hasDevServer: temDev,
    previewUrl: card.fm.preview_url || (temDev ? `http://localhost:${previewPort(id)}` : ''),
    previewAtivo: ativo,
    previewSubindo: subindo,
  })
  return renderPlan(plano, { color })
}

const previewVivo = new Map<string, boolean>()

function cabecalhoDaTarefa(state: SessionState): string[] {
  const card = readCard(state.seguindo)
  if (!card) return [`card #${state.seguindo} nao encontrado`]
  const alvo = repoPath(card.fm.repo ?? '')
  const temDev = existsSync(alvo) && hasDevServer(alvo)
  const url = card.fm.preview_url || (temDev ? `http://localhost:${previewPort(state.seguindo)}` : '')
  const cab = renderCabecalhoTarefa(card, {
    color,
    width: Math.max(40, (Number(process.stdout.columns) || 78) - 6),
    objetivo: extractObjetivo(card.body) || String(card.fm.title ?? ''),
    subs: subPrompts(card.body),
    previewUrl: url,
    temDevServer: temDev,
    vivo: previewVivo.get(state.seguindo) ?? false,
  })
  return cab
}

function seguimento(state: SessionState): string[] {
  const at = atividadeDe(state.seguindo)
  return at.length ? at.slice(-200).map(formatar) : ['  aguardando a IA…']
}

function custoDoDia(repo: string): string {
  const hoje = new Date().toISOString().slice(0, 10)
  const t = allCards()
    .filter(c => (!repo || c.repo === repo) && String(c.updated ?? '').startsWith(hoje))
    .reduce((a, c) => a + (parseFloat(String(c.cost_usd ?? '0')) || 0), 0)
  return t ? t.toFixed(2) : ''
}

function esforcoAtual(state: SessionState): string {
  const alvo = state.seguindo || state.pendingPlan
  return (alvo ? readCard(alvo)?.fm.effort : '') || process.env.HICODE_EFFORT || 'medium'
}

function papeisDivergentes(): string[] {
  const base = providerNameFor('implement')
  return (['step', 'gate', 'verify'] as const)
    .filter(p => providerNameFor(p) !== base)
    .map(p => `${p}: ${providerNameFor(p)}`)
}

function rodapeDa(state: SessionState, noRodape = false): string[] {
  const largura = Number(process.stdout.columns) || 80
  const props = linhaPropriedades({
    provedor: providerNameFor('implement'),
    modelo: modelFor('implement') ?? '',
    effort: esforcoAtual(state),
    projeto: state.repo,
    custoHoje: custoDoDia(state.repo),
    divergentes: papeisDivergentes(),
  }, { color, width: largura })
  const cards = allCards()
  const rodando = emExecucao(cards, state.repo, Date.now(), id => ultimoAgente(atividadeDe(id)))
  const marcado = {
    color, now: Date.now(), width: largura,
    selecionado: noRodape ? selecionado : '',
    maxLinhas: noRodape ? 6 : 3,
  }
  const espera = linhasEspera(esperandoVoce(cards, state.repo), marcado)
  return [props, ...linhasExecucao(rodando, marcado), ...espera]
}

function dicaDa(state: SessionState): string {
  if (selecionado) return 'setas movem  enter entra  esc sai'
  if (state.removendo) return 'enter confirma  n cancela'
  if (state.perguntando) return 'numero responde  ctrl+j quebra linha'
  const esperando = cardsPerguntando(allCards(), state.repo)
  if (esperando.length) return `/ask responde #${esperando[0]}  ctrl+c sai`
  if (state.seguindo) return '/board volta  ctrl+c sai'
  return '/help  ctrl+j quebra linha  ctrl+l limpa  ctrl+c sai'
}

let selecionado = ''

function ordemDoRodape(state: SessionState): string[] {
  const cards = allCards()
  const rodando = emExecucao(cards, state.repo, Date.now(), () => '').map(e => e.id)
  const espera = esperandoVoce(cards, state.repo).map(e => e.id)
  return [...rodando, ...espera.filter(id => !rodando.includes(id))]
}

function navegar(state: SessionState, dir: -1 | 1, modo: ModoNavegacao): boolean {
  const ordem = modo === 'rodape' ? ordemDoRodape(state) : ordemDoBoard(allCards(), state.repo)
  if (!ordem.length) return false
  const atual = ordem.indexOf(selecionado)
  const proximo = atual < 0 ? 0 : atual + dir
  if (proximo < 0) { selecionado = ''; return false }
  selecionado = ordem[Math.min(proximo, ordem.length - 1)] ?? ''
  return true
}

function opcoesDoBoard(state: SessionState): Parameters<typeof renderBoard>[1] {
  return {
    color, repo: state.repo, daemon: daemonStatus(), passosDe, selecionado,
    now: Date.now(), width: Number(process.stdout.columns) || 78,
  }
}

function board(state: SessionState): string {
  return renderBoard(allCards(), opcoesDoBoard(state))
}

function boardNavegavel(state: SessionState, altura: number): string[] {
  const cabecalho = [
    `  ${color ? ACC : ''}board${color ? RESET : ''} ${dim('· ↑↓ move · enter abre · → volta a escrever')}`,
    '',
  ]
  const corpo = renderBoardJanela(allCards(), opcoesDoBoard(state), Math.max(4, altura - cabecalho.length))
  return [...cabecalho, ...corpo]
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

async function listarPreviews(limpar: boolean): Promise<string[]> {
  const cards = allCards()
  const vivos: string[] = []
  for (const c of cards) {
    const url = c.preview_url || ''
    if (url && await httpOk(url)) vivos.push(url)
  }
  const portas = inventario({ cards, base: PREVIEW_BASE_PORT, vivo: (u) => vivos.includes(u) })
  if (!portas.length) return ['  nenhum preview rodando']
  const out = portas.map(p => {
    const marca = p.situacao === 'orfao' ? 'orfao' : 'em uso'
    return `  ${p.url}  ${dim(`#${p.cardId} ${p.status.toLowerCase()} · ${marca}`)}`
  })
  const soltos = orfaos(portas)
  if (!soltos.length) return out
  if (!limpar) {
    out.push(dim(`  ${soltos.length} orfao(s) — /preview --limpar derruba`))
    return out
  }
  for (const p of soltos) {
    stopPreview(p.pid)
    core.setPreviewPid(p.cardId, 0)
  }
  out.push(dim(`  ${soltos.length} orfao(s) derrubado(s)`))
  return out
}

async function contextoPreview(id: string): Promise<{ url: string; vivo: boolean; temDev: boolean; plano: ReturnType<typeof planejarPreview> }> {
  const card = readCard(id)
  if (!card) return { url: '', vivo: false, temDev: false, plano: { acao: 'nada', url: '', motivo: 'card nao encontrado' } }
  const alvo = repoPath(card.fm.repo ?? '')
  const temDev = existsSync(alvo) && hasDevServer(alvo)
  const url = card.fm.preview_url || (temDev ? `http://localhost:${previewPort(id)}` : '')
  const vivo = url ? await httpOk(url) : false
  const plano = planejarPreview({
    status: card.fm.status ?? '',
    worktree: card.fm.worktree ?? '',
    url, vivo, temDevServer: temDev,
  })
  return { url, vivo, temDev, plano }
}

async function subirPreview(id: string): Promise<string> {
  const card = readCard(id)
  if (!card) return `card #${id} nao encontrado`
  const alvo = repoPath(card.fm.repo ?? '')
  if (!existsSync(alvo)) return `clone de ${card.fm.repo} nao encontrado`
  if (!hasDevServer(alvo)) return `${card.fm.repo} nao tem script de dev — nao ha preview`
  const wt = card.fm.worktree ?? ''
  if (!wt || !existsSync(wt)) {
    return `#${id} ainda nao tem worktree — o preview sobe quando a tarefa executar`
  }
  const porta = previewPort(id)
  const url = `http://localhost:${porta}`
  if (await httpOk(url)) return `#${id} ja esta no ar → ${url}`
  const handle = await ensurePreview(wt, porta, alvo, card.fm.preview_pid)
  if (!handle.pid) return `nao consegui subir o preview de #${id}`
  core.setPreviewPid(id, handle.pid)
  const subiu = await waitHttp(url, 30)
  return subiu ? `#${id} no ar → ${url}` : `#${id} iniciado (pid ${handle.pid}), mas ${url} ainda nao responde`
}

function ioDo(app: { log: (s: string) => void }, diga: (s: string) => void): DispatchIO {
  return {
    log: (l) => (l.startsWith(' ') || l === '' ? app.log(l) : diga(l)),
    dim,
    color,
    largura: () => Math.max(40, (Number(process.stdout.columns) || 78) - 6),
    subirPreview,
    listarPreviews,
    plano: async (id) => {
      const ctx = await contextoPreview(id)
      if (ctx.plano.acao === 'subir') {
        void subirPreview(id).then(msg => app.log(`  ${msg}`))
      }
      return planoDe(id, ctx.vivo, ctx.plano.acao === 'subir').split('\n')
    },
    atividade: (id) => {
      const at = atividadeDe(id)
      if (!at.length) return []
      return [`#${id} — ${resumo(at) || 'sem ferramenta usada'}`, ...at.filter(x => x.tipo !== 'texto').slice(-14).map(formatar)]
    },
  }
}

async function tui(state0: SessionState): Promise<void> {
  let state = state0
  let modoAtual: ModoNavegacao = ''
  const term = nodeTerminal()
  let sairPedido = false
  const app = createApp(term, {
    header: () => `hii · ${state.repo || '(sem projeto)'}${state.seguindo ? ` · seguindo #${state.seguindo}` : ''}   daemon ${daemonStatus()}`,
    corpo: (ctx) => {
      modoAtual = ctx.navegando
      if (ctx.navegando === 'board') return boardNavegavel(state, ctx.altura)
      return state.seguindo ? seguimento(state) : board(state).split('\n')
    },
    fixo: (ctx) => (state.seguindo && ctx.navegando !== 'board' ? cabecalhoDaTarefa(state) : []),
    dica: (ctx) => (ctx.navegando ? '↑↓ move · enter abre · → volta · ← board' : dicaDa(state)),
    prompt: () => '› ',
    rodape: () => rodapeDa(state, modoAtual === 'rodape'),
    intervalMs: 400,
    onComplete: (linha) => completer(linha)[0],
    onInterrupt: () => { sairPedido = true; return true },
    onNav: (dir, modo) => navegar(state, dir, modo),
    podeLimpar: () => {
      const rodando = emExecucao(allCards(), state.repo, Date.now(), () => '')
      if (!rodando.length) return ''
      const ids = rodando.map(e => `#${e.id}`).join(' ')
      return `${ids} em execucao — a area so limpa quando terminar`
    },
    onEntrar: (modo) => {
      if (!selecionado) return
      const alvo = selecionado
      selecionado = ''
      state = seguir(state, alvo)
      void httpOk(`http://localhost:${previewPort(alvo)}`).then(v => previewVivo.set(alvo, v))
      if (modo === 'rodape') {
        app.log(`  seguindo a execucao de #${alvo} — /board volta`)
        return
      }
      void (async () => {
        const card = readCard(alvo)
        const vivo = card?.fm.preview_url ? await httpOk(card.fm.preview_url) : false
        for (const l of planoDe(alvo, vivo).split('\n')) app.log(l)
        app.log(`  seguindo a execucao de #${alvo} — /board volta`)
      })()
    },
    onLine: async (linha) => {
      const { effect, state: next } = handle(linha, state)
      state = next
      const diga = (s: string): void => app.log('  ' + s)
      if (effect.kind === 'quit') { sairPedido = true; return }
      if (effect.kind === 'submit') {
        if (state.perguntando) state = respondido(state)
        if (!state.repo) return diga('sem projeto — /repo <owner/nome>')
        const novoId = core.submit({ title: effect.text ?? '', repo: state.repo })
        diga(`card #${novoId} criado`)
        for (const l of planoDe(novoId).split('\n')) app.log(l)
        state = planShown(state, novoId)
        diga('enter aprova e enfileira · outra tarefa descarta')
        return
      }
      const r = await dispatch(effect, state, ioDo(app, diga))
      state = r.state
      if (!r.tratado && effect.kind === 'board') state = { ...state, seguindo: '' }
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
    if (effect.kind === 'board') { await boardAoVivo(state); continue }
    if (effect.kind === 'reopen-repo') {
      state = { ...state, repo: await escolherProjeto(ask) }
      fleet(state)
      continue
    }
    if (effect.kind === 'submit') {
      if (!state.repo) { say(dim('  defina o repo-alvo primeiro: /repo <owner/nome>')); continue }
      const novoId = core.submit({ title: effect.text ?? '', repo: state.repo })
      say(dim(`  card #${novoId} criado`))
      state = showPlan(novoId, state)
      continue
    }
    const passo = await dispatch(effect, state, ioDo({ log: (l) => say(l) }, (l) => say(dim('  ' + l))))
    state = passo.state
    if (effect.kind === 'approve-plan' && !daemonPid()) say(dim('  daemon offline — vai rodar quando voce subir com `hii start`'))
  }
  rl.close()
  say(dim('  sessao encerrada — os cards seguem rodando'))
}

await main()
