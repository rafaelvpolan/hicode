import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CardStatus, CustoPorRepo, FilaPorStatus, GateCodefox, MotorEstadoResponse, PrAberto, WorktreeAtivo } from '#shared/types'
import { floorProviders } from '#shared/cost-floor'
import { statusCanonicoOuNulo } from '#shared/status'
import { lerCota } from '../motor/cota'
import { tentativasDoCard } from '../motor/tentativas'
import { readCards } from './card-io'
import type { IdentifiedCard } from './card-io'

const LACUNAS: readonly string[] = [
  'contagem de jobs "em voo" (concorrencia real vs MAX_CONCURRENCY) vive so na memoria do processo do motor (lib/runner/queue-state.ts, emVoo) e nao e persistida em disco nem exposta pelo CLI do hii — "fila" abaixo conta cards por status (determinístico), nao quantos rodam concorrentemente agora',
  'escrita de config/pipeline.json depende de um verbo no CLI do hii que ainda nao existe — GET /api/motor/pipeline expoe somente leitura (somenteLeitura=true)',
]

function custoUsdDe(card: IdentifiedCard): number {
  return parseFloat(card.cost_usd || '0') || 0
}

function filaPorStatus(cards: IdentifiedCard[]): FilaPorStatus[] {
  const porStatus = new Map<CardStatus, string[]>()
  for (const card of cards) {
    const status = statusCanonicoOuNulo(card.status || 'INBOX')
    if (!status) continue
    porStatus.set(status, [...(porStatus.get(status) ?? []), card.id])
  }
  return [...porStatus].map(([status, cardIds]) => ({ status, cardIds }))
}

function custoPorRepo(cards: IdentifiedCard[]): CustoPorRepo[] {
  const porRepo = new Map<string, { custoUsd: number; pisoProvedores: Set<string> }>()
  for (const card of cards) {
    const repo = card.repo || '(sem repo)'
    const atual = porRepo.get(repo) ?? { custoUsd: 0, pisoProvedores: new Set<string>() }
    atual.custoUsd += custoUsdDe(card)
    for (const provedor of floorProviders({ cost_floor: card.cost_floor || '', cost_unverified: card.cost_unverified || '' })) {
      atual.pisoProvedores.add(provedor)
    }
    porRepo.set(repo, atual)
  }
  return [...porRepo.entries()].map(([repo, valor]) => ({
    repo,
    custoUsd: Number(valor.custoUsd.toFixed(4)),
    piso: valor.pisoProvedores.size > 0,
    pisoProvedores: [...valor.pisoProvedores],
  }))
}

function gates(cards: IdentifiedCard[]): GateCodefox[] {
  return cards
    .filter(card => card.review_verdict)
    .map(card => ({ cardId: card.id, veredito: card.review_verdict || '', motivo: card.review_reason || '' }))
}

function worktreesAtivos(cards: IdentifiedCard[]): WorktreeAtivo[] {
  return cards
    .filter(card => card.worktree)
    .map(card => ({
      cardId: card.id,
      caminho: card.worktree || '',
      branch: card.branch || '',
      existe: existsSync(join(card.worktree || '', '.git')),
    }))
}

function prsAbertos(cards: IdentifiedCard[]): PrAberto[] {
  return cards
    .filter(card => card.pr_url && card.status !== 'MERGED' && card.status !== 'DEPLOYED')
    .map(card => ({ cardId: card.id, url: card.pr_url || '', status: statusCanonicoOuNulo(card.status) ?? 'PR_OPEN' }))
}

export function estadoDoMotor(): MotorEstadoResponse {
  const cards = readCards()
  const tentativas = cards.map(card => tentativasDoCard(card.id)).filter(t => t.reprovacoesECorrecoes > 0 || t.reajustes.length > 0)
  return {
    geradoEm: new Date().toISOString(),
    fila: filaPorStatus(cards),
    tentativas,
    quota: lerCota(),
    custoTotalUsd: Number(cards.reduce((total, card) => total + custoUsdDe(card), 0).toFixed(4)),
    custoPorRepo: custoPorRepo(cards),
    gates: gates(cards),
    worktreesAtivos: worktreesAtivos(cards),
    prsAbertos: prsAbertos(cards),
    lacunas: [...LACUNAS],
  }
}
