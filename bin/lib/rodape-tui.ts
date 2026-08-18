import { readCard } from '../../lib/runner/card-store'
import { dailySpend } from '../../lib/runner/cost-gap'
import type { DailySpend } from '../../lib/runner/cost-gap'
import { effortFor, modelFor, providerNameFor } from '../../lib/ai/registry'
import { emExecucao, esperandoEmOutrosProjetos, esperandoVoce, linhaDeOutrosProjetos, linhaPropriedades, linhasAjustes, linhasEspera, linhasExecucao } from '../../lib/core/render/rodape'
import { itensDeAjuste } from '../../lib/core/ajustes'
import { cardsPerguntando } from '../../lib/core/responder'
import { ultimoAgente } from '../../lib/core/activity'
import type { SessionState } from '../../lib/core/session'
import { ACC, DIM, RESET, color } from './saida'
import { atividadeDe, todosOsCards } from './dados'
import { modoAtual, selecionado } from './estado'

export function custoDoDia(repo: string): DailySpend {
  const hoje = new Date().toISOString().slice(0, 10)
  return dailySpend(todosOsCards().filter(c => !repo || c.repo === repo), hoje)
}

export function esforcoAtual(state: SessionState): string {
  const alvo = state.seguindo || state.pendingPlan
  const doCard = alvo ? readCard(alvo)?.fm.effort : undefined
  return effortFor('implement', doCard) ?? '(padrao do CLI)'
}

export function papeisDivergentes(): string[] {
  const base = providerNameFor('implement')
  return (['step', 'gate', 'verify'] as const)
    .filter(p => providerNameFor(p) !== base)
    .map(p => `${p}: ${providerNameFor(p)}`)
}

export function rodapeDa(state: SessionState, noRodape = false): string[] {
  const largura = Number(process.stdout.columns) || 80
  const gasto = custoDoDia(state.repo)
  const props = linhaPropriedades({
    provedor: providerNameFor('implement'),
    modelo: modelFor('implement') ?? '',
    effort: esforcoAtual(state),
    projeto: state.repo,
    custoHoje: gasto.total,
    pisoDoGasto: gasto.floor,
    divergentes: papeisDivergentes(),
  }, { color, width: largura })
  const cards = todosOsCards()
  const rodando = emExecucao(cards, state.repo, Date.now(), id => ultimoAgente(atividadeDe(id)))
  const marcado = {
    color, now: Date.now(), width: largura,
    selecionado: noRodape ? selecionado() : '',
    maxLinhas: noRodape ? 6 : 3,
  }
  if (modoAtual() === 'ajustes') {
    return [props, ...linhasAjustes(itensDeAjuste(), { color, width: largura, selecionado: selecionado() })]
  }
  const espera = linhasEspera(esperandoVoce(cards, state.repo), marcado)
  const fora = linhaDeOutrosProjetos(esperandoEmOutrosProjetos(cards, state.repo), marcado)
  return [props, ...linhasExecucao(rodando, marcado), ...espera, ...fora]
}

export function pintarComando(linha: string): string {
  if (!color || !linha.startsWith('/')) return linha
  const m = linha.match(/^(\/[a-zA-Z-]*)(.*)$/s)
  if (!m) return linha
  const [, comando, resto] = m
  return `${ACC}${comando}${RESET}${resto ?? ''}`
}

export function dicaDa(state: SessionState, sugerindo = false): string {
  const texto = ((): string => {
    if (modoAtual() === 'ajustes') return '↑/↓ escolhe · tab troca · shift+tab sai'
    if (sugerindo) return '↑/↓ escolhe · tab completa · enter usa'
    if (selecionado()) return '↑/↓ move · enter entra · esc sai'
    if (state.comentando) return 'escreva o ajuste · enter vazio desiste'
    if (state.aprovando) return '↑/↓ escolhe · 1 aprova · 2 refaz · 3 comenta'
    if (state.escolhendo) return 'numero ou nome do projeto · enter desiste'
    if (state.retomando) return 'enter retoma de onde parou · ctrl+c sai do hii'
    if (state.removendo) return 'enter confirma · n cancela'
    if (state.perguntando) return '↑/↓ escolhe · numero responde · enter confirma'
    if (state.seguindo) return 'escreva para instruir · /board volta'
    const aqui = cardsPerguntando(todosOsCards(), state.repo)
    if (aqui.length) return `#${aqui[0]} espera resposta · /ask responde`
    const noutro = cardsPerguntando(todosOsCards())
    if (noutro.length) return `#${noutro[0]} espera resposta em outro projeto · /ask ${Number(noutro[0])}`
    return 'shift+tab ajusta a ia · ctrl+j quebra linha · /help para tudo'
  })()
  return color ? `${DIM}${texto}${RESET}` : texto
}
