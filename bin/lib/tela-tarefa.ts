import { existsSync } from 'node:fs'
import { readCard, repoPath } from '../../lib/runner/card-store'
import { hasDevServer } from '../../lib/runner/preview'
import { buildPlan } from '../../lib/core/plan'
import { renderPlan } from '../../lib/core/render/plan'
import { renderCabecalhoTarefa } from '../../lib/core/render/tarefa'
import { renderProcessos } from '../../lib/core/render/processos'
import { renderPendencia } from '../../lib/core/render/pendencia'
import { idadeDe } from '../../lib/core/render/board'
import { readRunSteps } from '../../lib/runner/runs'
import { extractObjetivo } from '../../lib/card'
import { subPrompts } from '../../lib/core/instruir'
import { formatar, ultimaAcao, ultimoAgente } from '../../lib/core/activity'
import type { SessionState } from '../../lib/core/session'
import { color } from './saida'
import { atividadeDe, passosDe } from './dados'

export function planoDe(id: string): string {
  const card = readCard(id)
  if (!card) return ''
  const alvo = repoPath(card.fm.repo ?? '')
  const plano = buildPlan({ card, hasDevServer: existsSync(alvo) && hasDevServer(alvo) })
  return renderPlan(plano, { color })
}

export function cabecalhoDaTarefa(state: SessionState): string[] {
  const card = readCard(state.seguindo)
  if (!card) return [`card #${state.seguindo} nao encontrado`]
  const cab = renderCabecalhoTarefa(card, {
    color,
    width: Math.max(40, (Number(process.stdout.columns) || 78) - 6),
    objetivo: extractObjetivo(card.body) || String(card.fm.title ?? ''),
    subs: subPrompts(card.body),
  })
  const status = String(card.fm.status ?? '')
  const pend = renderPendencia(status, state.seguindo, {
    color,
    width: Math.max(40, (Number(process.stdout.columns) || 78) - 6),
    detalhe: status === 'PR_OPEN' ? String(card.fm.pr_url ?? '') : '',
  })
  const passos = passosDe(card.fm)
  if (!passos.length) return [...cab, ...pend]
  const at = atividadeDe(state.seguindo)
  const processos = renderProcessos(passos, {
    color,
    width: Math.max(40, (Number(process.stdout.columns) || 78) - 6),
    metricas: readRunSteps(state.seguindo) ?? {},
    agente: ultimoAgente(at),
    ferramenta: ultimaAcao(at),
    desde: idadeDe(card.fm.updated, Date.now()),
    parado: ['HALTED', 'PAUSED', 'CLARIFY'].includes(status),
  })
  return [...cab, ...pend, ...processos, '']
}

export function seguimento(state: SessionState): string[] {
  const card = readCard(state.seguindo)
  const at = atividadeDe(state.seguindo)
  if (at.length) return at.slice(-200).map(formatar)
  const status = String(card?.fm.status ?? '')
  if (['EXECUTING', 'CORRECTING'].includes(status)) return ['  aguardando a IA…']
  if (status === 'HALTED') return ['  tarefa parada — escreva uma instrucao ou aperte enter para retomar']
  if (status === 'CLARIFY') return ['  esperando a sua resposta abaixo']
  return ['  nada em execucao nesta tarefa']
}
