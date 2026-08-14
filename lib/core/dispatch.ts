import { readCard, allCards } from '../runner/card-store'
import { readClarify } from '../runner/clarify'
import * as core from './actions'
import { planejarLote, removerLote } from './remover'
import { renderRemocao, renderResultado } from './render/remocao'
import { pendencia, responder, cardsPerguntando } from './responder'
import { renderPergunta, renderRespondidas } from './render/clarify'
import { instruir } from './instruir'
import { renderHelp } from './render/help'
import { esperandoVoce } from './render/rodape'
import { seguir, planShown, perguntando, removendo, respondido } from './session'
import type { Effect, SessionState } from './session'

export interface DispatchIO {
  log: (linha: string) => void
  dim: (texto: string) => string
  color: boolean
  largura: () => number
  subirPreview: (id: string) => Promise<string>
  listarPreviews: (limpar: boolean) => Promise<string[]>
  plano: (id: string) => Promise<string[]>
  atividade: (id: string) => string[]
}

export interface DispatchResult {
  state: SessionState
  tratado: boolean
}

const FORA = ['quit', 'board', 'reopen-repo', 'none']

async function aplicar(effect: Effect, state: SessionState, io: DispatchIO): Promise<SessionState> {
  const id = effect.id ?? ''
  const texto = effect.text ?? ''
  switch (effect.kind) {
    case 'help': {
      const espera = esperandoVoce(allCards(), state.repo)
      const linhas = renderHelp({
        color: io.color,
        width: io.largura(),
        repo: state.repo,
        esperando: espera.length,
        primeiroComando: espera[0]?.comando ?? '',
      })
      for (const l of linhas) io.log(l)
      return state
    }
    case 'error':
      io.log(texto)
      return state
    case 'cards': {
      const alvo = texto.trim().toUpperCase()
      const lista = allCards().filter(c => (!state.repo || c.repo === state.repo) && (!alvo || c.status === alvo))
      if (!lista.length) { io.log(alvo ? `nenhum card em ${alvo}` : 'nenhum card'); return state }
      for (const c of lista) io.log(`#${String(c.id).padStart(3, '0')} ${String(c.status).padEnd(12)} ${String(c.title ?? '').slice(0, 46)}`)
      return state
    }
    case 'watch': {
      const card = readCard(id)
      if (!card) { io.log(`card #${id} nao encontrado`); return { ...state, seguindo: '' } }
      if (card.fm.preview_url) io.log(`preview → ${card.fm.preview_url}`)
      return pendencia(id) ? perguntando(state, id) : state
    }
    case 'activity': {
      const linhas = io.atividade(id)
      if (!linhas.length) { io.log(`sem atividade registrada para #${id}`); return state }
      for (const l of linhas) io.log(l)
      return state
    }
    case 'plan': {
      const card = readCard(id)
      if (!card) { io.log(`card #${id} nao encontrado`); return state }
      for (const l of await io.plano(id)) io.log(l)
      const st = card.fm.status ?? 'INBOX'
      if (!core.canApprovePlan(st)) { io.log(`#${id} esta em ${st} — plano so para leitura`); return state }
      io.log('enter aprova e enfileira')
      return planShown(state, id)
    }
    case 'approve-plan': {
      const r = core.approvePlan(id)
      if (!r.ok) { io.log(r.reason); return state }
      io.log(`#${id} aprovado e na fila — seguindo a execucao (/board volta)`)
      return seguir(state, id)
    }
    case 'approve-preview': {
      const r = core.approvePreview(id)
      io.log(r.ok ? `#${id} preview aprovado — segue para o polimento` : r.reason)
      return state
    }
    case 'reject-preview': {
      const r = core.rejectPreview(id, texto)
      io.log(r.ok ? `#${id} ${texto ? 'vai corrigir' : 'vai refazer'}` : r.reason)
      return state
    }
    case 'halt': {
      const r = core.halt(id, texto)
      io.log(r ? `#${id} parado` : `card #${id} nao encontrado`)
      return state
    }
    case 'rm': {
      const lote = planejarLote(id.split(/\s+/))
      const forcar = texto === 'force'
      const alvos = forcar ? [...lote.removiveis, ...lote.bloqueados] : lote.removiveis
      for (const l of renderRemocao(lote, forcar, { color: io.color, width: io.largura() })) io.log(l)
      if (!alvos.length) return state
      return removendo(state, alvos.map(p => p.id).join(' '))
    }
    case 'confirm-rm': {
      if (texto !== 'sim') { io.log('cancelado — nada foi apagado'); return state }
      const r = await removerLote(id.split(/\s+/), true)
      for (const l of renderResultado(r.apagados, r.falhas, { color: io.color, width: io.largura() })) io.log(l)
      return state
    }
    case 'instruct': {
      const r = instruir(id, texto)
      if (!r.ok) { io.log(r.reason); return state }
      io.log(`instrucao ${r.numero} anotada em #${id}${r.reexecuta ? ' — a tarefa vai reexecutar com ela' : ''}`)
      return state
    }
    case 'preview': {
      if (id) { io.log(await io.subirPreview(id)); return state }
      for (const l of await io.listarPreviews(texto === 'limpar')) io.log(l)
      return state
    }
    case 'ask': {
      const alvo = id || cardsPerguntando(allCards(), state.repo)[0] || ''
      if (!alvo) { io.log('nenhum card esperando resposta'); return state }
      const p = pendencia(alvo)
      if (!p) {
        for (const l of renderRespondidas(alvo, readClarify(alvo), { color: io.color })) io.log(l)
        return state
      }
      for (const l of renderPergunta(p, { color: io.color })) io.log(l)
      return perguntando(state, alvo)
    }
    case 'answer': {
      const r = responder(id, texto)
      if (!r.ok) { io.log(r.reason); return state }
      io.log(`respondido: ${r.resposta}`)
      if (r.restantes > 0) {
        const proxima = pendencia(id)
        if (proxima) for (const l of renderPergunta(proxima, { color: io.color })) io.log(l)
        return state
      }
      io.log(`#${id} retomado — seguindo a execucao (/board volta)`)
      return seguir(respondido(state), id)
    }
    default:
      io.log(`efeito "${effect.kind}" chegou aqui sem tratamento — isso e bug do hii`)
      return state
  }
}

export async function dispatch(effect: Effect, state: SessionState, io: DispatchIO): Promise<DispatchResult> {
  if (FORA.includes(effect.kind)) return { state, tratado: false }
  return { state: await aplicar(effect, state, io), tratado: true }
}
