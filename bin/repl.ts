import { createInterface } from 'node:readline'
import { readCard, repoPath } from '../lib/runner/card-store'
import { dispatch } from '../lib/core/dispatch'
import type { DispatchIO } from '../lib/core/dispatch'
import { handle, newSession, planShown, seguir, perguntando, retomando, sincronizarAprovacao } from '../lib/core/session'
import type { SessionState } from '../lib/core/session'
import { daemonPid, daemonStatus } from '../lib/core/daemon'
import { pendencia } from '../lib/core/responder'
import { ciclarAjuste } from '../lib/core/ajustes'
import { quebrarEmLargura } from '../lib/core/tui/layout'
import { responderPergunta, classificarComIaLocal } from '../lib/runner/responder-pergunta'
import { renderParada } from '../lib/core/render/tarefa'
import { emExecucao } from '../lib/core/render/rodape'
import { floorProviders, formatProviders } from '../lib/runner/cost-gap'
import { createApp } from '../lib/core/tui/app'
import { nodeTerminal } from '../lib/core/tui/screen'
import { ACC, RESET, color, dim, say, escolherProjeto } from './lib/saida'
import { larguraUtil, reposRegistrados, todosOsCards } from './lib/dados'
import { definirModo, modoAtual, selecionado, selecionar } from './lib/estado'
import { cabecalhoDaTarefa, planoDe, seguimento } from './lib/tela-tarefa'
import { dicaDa, pintarComando, rodapeDa } from './lib/rodape-tui'
import { avisoRepos, board, boardNavegavel, completer, navegar, navegarConfig } from './lib/board-tui'
import { boardAoVivo, ensureDaemon, fleet } from './lib/comandos'
import { etiquetaDoProjeto } from '../lib/core/render/projeto'
import { renderSugestoes, prefixoComum } from '../lib/core/render/sugestoes'
import { renderConfig } from '../lib/core/render/config'
import { lerConfig } from '../lib/core/config-snapshot'
import { aplicar as aplicarIa } from '../lib/core/escolher-ia'
import { renderAprovacao } from '../lib/core/render/aprovacao'
import * as core from '../lib/core/actions'

function ioDo(app: { log: (s: string) => void }, diga: (s: string) => void, repo = ''): DispatchIO {
  return {
    log: (l) => (l.startsWith(' ') || l === '' ? app.log(l) : diga(l)),
    dim,
    color,
    largura: larguraUtil,
    classificar: classificarComIaLocal,
    responder: async (pergunta, conversa) => {
      const alvo = repoPath(repo)
      const r = await responderPergunta(pergunta, alvo, conversa)
      if (!r.ok && !r.texto) return ['  nao consegui responder — a consulta falhou']
      const corpo = quebrarEmLargura(r.texto, larguraUtil() - 2).map(l => `  ${l}`)
      const gasto = r.custo
        ? dim(`  (${r.provedor}${r.custoMedido ? '' : ', custo estimado'} · US$${r.custo.toFixed(4)})`)
        : dim(`  (${r.provedor})`)
      return [...corpo, '', gasto]
    },
    plano: async (id) => planoDe(id).split('\n'),
  }
}

async function tui(state0: SessionState): Promise<void> {
  let state = state0
  const term = nodeTerminal()
  let sairPedido = false
  async function processar(linha: string): Promise<void> {
    const { effect, state: next } = handle(linha, state)
    state = next
    const diga = (s: string): void => app.log('  ' + s)
    if (effect.kind === 'quit') { sairPedido = true; return }
    const r = await dispatch(effect, state, ioDo(app, diga, state.repo))
    state = r.state
    if (effect.kind === 'nova-sessao') { selecionar(''); app.limparLog() }
    if (!r.tratado && effect.kind === 'board') {
      state = { ...state, seguindo: '' }
      app.abrirBoard()
    }
  }

  const app = createApp(term, {
    header: () => `${color ? ACC : ''}hii${color ? RESET : ''}${dim(`   daemon ${daemonStatus()}`)}`,
    corpo: (ctx) => {
      definirModo(ctx.navegando)
      if (state.tela === 'config') {
        return renderConfig(lerConfig(state.repo, selecionado()), {
          color, largura: larguraUtil(), altura: ctx.altura,
        })
      }
      if (ctx.navegando === 'board') return boardNavegavel(state, ctx.altura)
      return state.seguindo ? seguimento(state) : board(state).split('\n')
    },
    fixo: (ctx) => (state.seguindo && state.tela !== 'config' && ctx.navegando !== 'board' ? cabecalhoDaTarefa(state) : []),
    logPrimeiro: () => !!state.seguindo,
    acima: () => {
      if (state.comentando) return renderAprovacao(state.comentando, { color, comentando: true, width: larguraUtil() })
      if (state.seguindo) state = sincronizarAprovacao(state, String(readCard(state.seguindo)?.fm.status ?? ''))
      if (!state.aprovando) return []
      return renderAprovacao(state.aprovando, {
        color,
        width: larguraUtil(),
        selecionado: selecionado(),
        url: String(readCard(state.aprovando)?.fm.preview_url ?? ''),
      })
    },
    dica: (ctx) => (ctx.navegando ? '↑↓ move · enter abre · → volta · ← board' : dicaDa(state, ctx.sugerindo)),
    prompt: () => '› ',
    legenda: () => etiquetaDoProjeto(state.repo, {
      color,
      indice: reposRegistrados().findIndex(r => r.name === state.repo),
      detalhe: state.seguindo ? `tarefa #${state.seguindo}` : '',
    }),
    rodape: () => rodapeDa(state, modoAtual() === 'rodape'),
    intervalMs: 400,
    onComplete: (linha) => completer(linha)[0],
    sugestoes: (opcoes, selecionado) => renderSugestoes(opcoes, {
      color, selecionado, width: Math.max(40, (Number(process.stdout.columns) || 78) - 6),
    }),
    prefixoComum,
    corInput: (linha) => pintarComando(linha),
    onInterrupt: () => {
      const id = state.seguindo
      const card = id ? readCard(id) : null
      const status = String(card?.fm.status ?? '')
      if (!card || !['EXECUTING', 'CORRECTING'].includes(status)) {
        sairPedido = true
        return true
      }
      core.halt(id, 'parado pelo humano (ctrl+c)')
      state = retomando(state, id)
      const custo = parseFloat(String(card.fm.cost_usd ?? '0')) || 0
      for (const l of renderParada(id, {
        color, custo: custo.toFixed(2),
        pisoDoGasto: formatProviders(floorProviders(card.fm)),
        width: Math.max(40, (Number(process.stdout.columns) || 78) - 6),
      })) app.log(l)
      return false
    },
    onNav: (dir, modo) => (state.tela === 'config' ? navegarConfig(dir) : navegar(state, dir, modo)),
    onCiclarIa: (dir) => {
      const r = ciclarAjuste(selecionado(), dir)
      app.log(`  ${r.mensagem}`)
    },
    onAba: (dir) => {
      const nomes = reposRegistrados().map(r => r.name)
      if (nomes.length < 2) return
      const i = nomes.indexOf(state.repo)
      const proximo = nomes[(i + dir + nomes.length) % nomes.length] ?? state.repo
      state = { ...state, repo: proximo }
      selecionar('')
    },
    podeLimpar: () => {
      const rodando = emExecucao(todosOsCards(), state.repo, Date.now(), () => '')
      if (!rodando.length) return ''
      const ids = rodando.map(e => `#${e.id}`).join(' ')
      return `${ids} em execucao — a area so limpa quando terminar`
    },
    onEntrar: (modo) => {
      if (state.tela === 'config') {
        const escolha = selecionado()
        if (escolha) app.log(`  ${aplicarIa({ papeis: ['implement'], provider: escolha }).mensagem}`)
        return
      }
      if (selecionado().startsWith('op:')) {
        const escolha = selecionado().slice(3)
        selecionar('')
        void processar(escolha)
        return
      }
      if (!selecionado()) return
      const alvo = selecionado()
      selecionar('')
      state = seguir(state, alvo)
      if (pendencia(alvo)) state = perguntando(state, alvo)
      state = sincronizarAprovacao(state, String(readCard(alvo)?.fm.status ?? ''))
      app.limparLog()
    },
    onLine: processar,
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
    const passo = await dispatch(effect, state, ioDo({ log: (l) => say(l) }, (l) => say(dim('  ' + l)), state.repo))
    state = passo.state
    if (effect.kind === 'approve-plan' && !daemonPid()) say(dim('  daemon offline — vai rodar quando voce subir com `hii start`'))
  }
  rl.close()
  say(dim('  sessao encerrada — os cards seguem rodando'))
}

await main()