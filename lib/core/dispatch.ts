import { readCard, allCards } from '../runner/card-store'
import { readClarify } from '../runner/clarify'
import * as core from './actions'
import { planejarLote, removerLote } from './remover'
import { pendencia, responder, cardsPerguntando } from './responder'
import { renderPergunta, renderRespondidas } from './render/clarify'
import { renderHelp } from './render/help'
import { esperandoVoce } from './render/rodape'
import { seguir, planShown, perguntando, removendo, respondido } from './session'
import type { Effect, SessionState } from './session'

export interface DispatchIO {
  log: (linha: string) => void
  dim: (texto: string) => string
  color: boolean
  largura: () => number
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
      return state
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
      for (const a of lote.ausentes) io.log(io.dim(`  #${a} nao encontrado`))
      if (!forcar) for (const b of lote.bloqueados) io.log(io.dim(`  #${b.id} fica — ${b.bloqueio}`))
      if (!alvos.length) { io.log('nada a apagar'); return state }
      io.log(alvos.length === 1 ? `apagar 1 card?` : `apagar ${alvos.length} cards?`)
      for (const p of alvos) {
        const extra = [p.worktree ? 'worktree' : '', p.previewPid ? 'preview' : ''].filter(Boolean).join(' + ')
        io.log(io.dim(`  #${p.id} ${p.status}  ${p.titulo.slice(0, 40)}${extra ? `  (${extra})` : ''}`))
      }
      for (const a of [...new Set(alvos.flatMap(p => p.avisos))]) io.log(io.dim(`  ${a}`))
      io.log('s confirma · qualquer outra tecla cancela')
      return removendo(state, alvos.map(p => p.id).join(' '))
    }
    case 'confirm-rm': {
      if (texto !== 'sim') { io.log('cancelado'); return state }
      const r = await removerLote(id.split(/\s+/), true)
      if (r.apagados.length) io.log(`${r.apagados.length} card(s) apagado(s): ${r.apagados.map(x => `#${x}`).join(' ')}`)
      for (const f of r.falhas) io.log(`#${f.id}: ${f.reason}`)
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
