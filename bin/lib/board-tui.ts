import { existsSync } from 'node:fs'
import { reposFile } from '../../lib/runner/config'
import { repoPath, repoRegistered } from '../../lib/runner/card-store'
import { abasDe, ordemDoBoard, renderAbas, renderBoard, renderBoardJanela } from '../../lib/core/render/board'
import { daemonStatus } from '../../lib/core/daemon'
import { emExecucao, esperandoVoce } from '../../lib/core/render/rodape'
import { pendencia } from '../../lib/core/responder'
import { ordemDosAjustes } from '../../lib/core/ajustes'
import { complete } from '../../lib/core/complete'
import { ordemDaConfig } from '../../lib/core/config-snapshot'
import { STATUSES } from '../../lib/card'
import { agentRoles, providerNameFor, providerNames } from '../../lib/ai/registry'
import { modelosDe } from '../../lib/ai/catalogo'
import { ESFORCOS } from '../../lib/ai/preferencias'
import type { SessionState } from '../../lib/core/session'
import type { ModoNavegacao } from '../../lib/core/tui/input'
import { ACC, RESET, color, dim, say } from './saida'
import { passosDe, reposRegistrados, todosOsCards } from './dados'
import { selecionado, selecionar } from './estado'

export function ordemDoRodape(state: SessionState, modo: ModoNavegacao = 'rodape'): string[] {
  if (modo === 'ajustes') return ordemDosAjustes()
  if (state.aprovando) return ['op:1', 'op:2', 'op:3']
  if (state.perguntando) {
    const p = pendencia(state.perguntando)
    if (p) return p.atual.options.map((_, i) => `op:${i + 1}`)
  }
  const cards = todosOsCards()
  const rodando = emExecucao(cards, state.repo, Date.now(), () => '').map(e => e.id)
  const espera = esperandoVoce(cards, state.repo).map(e => e.id)
  return [...rodando, ...espera.filter(id => !rodando.includes(id))]
}

export function navegar(state: SessionState, dir: -1 | 1, modo: ModoNavegacao): boolean {
  const ordem = modo === 'board' ? ordemDoBoard(todosOsCards(), state.repo) : ordemDoRodape(state, modo)
  if (!ordem.length) return false
  const atual = ordem.indexOf(selecionado())
  const proximo = atual < 0 ? 0 : atual + dir
  if (proximo < 0) { selecionar(''); return false }
  selecionar(ordem[Math.min(proximo, ordem.length - 1)] ?? '')
  return true
}

export function opcoesDoBoard(state: SessionState): Parameters<typeof renderBoard>[1] {
  return {
    color, repo: state.repo, daemon: daemonStatus(), passosDe, selecionado: selecionado(),
    now: Date.now(), width: Number(process.stdout.columns) || 78,
  }
}

export function board(state: SessionState): string {
  return renderBoard(todosOsCards(), opcoesDoBoard(state))
}

export function boardNavegavel(state: SessionState, altura: number): string[] {
  const cards = todosOsCards()
  const abas = renderAbas(abasDe(reposRegistrados().map(r => r.name), cards), state.repo, { color })
  const cabecalho = [
    `  ${color ? ACC : ''}board${color ? RESET : ''} ${dim(abas.length ? '· ↑↓ move · tab troca de projeto · enter abre · → volta' : '· ↑↓ move · enter abre · → volta a escrever')}`,
    '',
    ...abas,
  ]
  const corpo = renderBoardJanela(todosOsCards(), opcoesDoBoard(state), Math.max(4, altura - cabecalho.length))
  return [...cabecalho, ...corpo]
}

export function avisoRepos(state: SessionState): void {
  const registrados = reposRegistrados()
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

export function completer(line: string): [string[], string] {
  return complete(line, {
    repos: reposRegistrados().map(r => r.name),
    cards: todosOsCards().map(c => String(c.id ?? '')).filter(Boolean),
    statuses: [...STATUSES],
    provedores: providerNames(),
    modelos: modelosDe(providerNameFor('implement')),
    esforcos: [...ESFORCOS],
    papeis: agentRoles(),
  })
}

export function navegarConfig(dir: -1 | 1): boolean {
  const ordem = ordemDaConfig()
  if (!ordem.length) return false
  const atual = ordem.indexOf(selecionado())
  const proximo = atual < 0 ? 0 : atual + dir
  if (proximo < 0) { selecionar(''); return false }
  selecionar(ordem[Math.min(proximo, ordem.length - 1)] ?? '')
  return true
}
