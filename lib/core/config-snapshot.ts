import { agentRoles, effortFor, modelFor, providerLimits, providerNameFor, providerNames } from '../ai/registry'
import { provedoresDisponiveis } from '../ai/disponibilidade'
import { planoDoProvedor } from '../ai/planos'
import { estadoDoOllama } from '../ai/ollama-estado'
import type { ProvedorDisponivel } from '../ai/disponibilidade'
import { JANELA_5H, JANELA_SEMANA, consumoPorProvedor, serieDeCusto } from '../ai/consumo'
import { allCards } from '../runner/card-store'
import { dailySpend } from '../runner/cost-gap'
import { emExecucao } from './render/rodape'
import { idadeDe } from './render/board'
import type { AgentRole, AiProviderName } from '../ai/types'
import type { EstadoDaConfig, ItemDoLoop, LinhaDeProvedor } from './render/config'

const BALDES_DA_SERIE = 48

function papeisDe(provedor: string): string[] {
  return agentRoles().filter(papel => providerNameFor(papel) === provedor)
}

function papelPrincipal(provedor: string): AgentRole | undefined {
  return papeisDe(provedor)[0] as AgentRole | undefined
}

function linhaDeProvedor(nome: AiProviderName, estados: Map<string, ProvedorDisponivel>): LinhaDeProvedor {
  const limites = providerLimits(nome)
  const papel = papelPrincipal(nome)
  const estado = estados.get(nome)
  const plano = planoDoProvedor(nome)
  return {
    nome,
    situacao: estado ? estado.situacao : 'ausente',
    habilitado: habilitadoDe(nome, estado),
    motivo: estado && estado.situacao !== 'disponivel' ? estado.comoObter : '',
    plano: plano.plano,
    detalheDoPlano: plano.detalhe,
    janelas: plano.janelas,
    idadeDoUsoHoras: plano.idadeHoras,
    modelosDisponiveis: nome === 'ollama' ? estadoDoOllama().modelos : plano.modelos,
    papeis: papeisDe(nome),
    modelo: papel ? modelFor(papel) ?? '' : '',
    esforco: papel ? effortFor(papel) ?? '' : '',
    restringeFerramenta: limites ? limites.restrictsTools : true,
    isolaLeitura: limites ? limites.isolatesReadonly : true,
    reportaCusto: limites ? limites.reportsCostUsd : true,
  }
}

export function habilitadoDe(nome: AiProviderName, estado: ProvedorDisponivel | undefined): boolean {
  if (!estado || estado.situacao === 'ausente') return false
  if (nome === 'ollama') return estadoDoOllama().habilitado
  return true
}

export function estadosPorNome(): Map<string, ProvedorDisponivel> {
  return new Map(provedoresDisponiveis().map(p => [p.nome, p]))
}

export function loopEmExecucao(repo: string, agoraMs: number): { itens: ItemDoLoop[]; fila: number } {
  const cards = allCards()
  const rodando = emExecucao(cards, repo, agoraMs, () => '')
  const itens = rodando.map(e => ({
    id: e.id,
    passo: e.estado.toLowerCase(),
    agente: e.agente,
    desde: e.desde,
  }))
  const fila = cards.filter(c => (!repo || c.repo === repo) && String(c.status ?? '') === 'READY').length
  return { itens, fila }
}

export function lerConfig(repo: string, selecionado: string, agoraMs: number = Date.now()): EstadoDaConfig {
  const estados = estadosPorNome()
  const provedores = providerNames().map(nome => linhaDeProvedor(nome, estados))
  const hoje = new Date(agoraMs).toISOString().slice(0, 10)
  const gasto = dailySpend(allCards().filter(c => !repo || c.repo === repo), hoje)
  const { itens, fila } = loopEmExecucao(repo, agoraMs)
  return {
    provedores,
    selecionado: selecionado || provedores[0]?.nome || '',
    uso5h: consumoPorProvedor(JANELA_5H, agoraMs),
    usoSemana: consumoPorProvedor(JANELA_SEMANA, agoraMs),
    serie: serieDeCusto(JANELA_5H, BALDES_DA_SERIE, agoraMs),
    loop: itens,
    fila,
    gastoHoje: Number(gasto.total) || 0,
    tetoUsd: Number(process.env.HICODE_BUDGET_USD ?? '0'),
    projeto: repo,
  }
}

export function ordemDaConfig(): string[] {
  return providerNames()
}

