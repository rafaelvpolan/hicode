import type { LeituraDeCota, UsoDeProvedor } from '#shared/types'
import type { ExecucaoEmDisco } from './execucoes'
import { lerExecucoes } from './execucoes'

const JANELA_COTA_MS = 4 * 60 * 60 * 1000
const PROVEDOR_DESCONHECIDO = 'desconhecido'

interface Contribuicao {
  provedor: string
  provedorIdentificado: boolean
  modelos: string[]
  custoUsd: number
  tokens: number
  falhou: boolean
}

interface Acumulador {
  uso: UsoDeProvedor
  primeiroMs: number
  ultimoMs: number
  limiteMs: number
}

function doTopoDaExecucao(e: ExecucaoEmDisco): Contribuicao {
  return {
    provedor: e.provider || PROVEDOR_DESCONHECIDO,
    provedorIdentificado: e.provider !== '',
    modelos: e.model ? [e.model] : [],
    custoUsd: e.custoUsd,
    tokens: e.tokensTotal,
    falhou: !e.ok,
  }
}

function contribuicoesDe(e: ExecucaoEmDisco): Contribuicao[] {
  if (!e.ias.length) return [doTopoDaExecucao(e)]
  const porProvedor = new Map<string, Contribuicao>()
  for (const ia of e.ias) {
    const provedor = ia.provedor || PROVEDOR_DESCONHECIDO
    const atual = porProvedor.get(provedor) ?? {
      provedor,
      provedorIdentificado: !!ia.provedor,
      modelos: [],
      custoUsd: 0,
      tokens: 0,
      falhou: false,
    }
    atual.custoUsd += ia.custoUsd
    atual.tokens += ia.tokens
    atual.falhou = atual.falhou || ia.falhas > 0 || (!e.ok && provedor === e.provider)
    if (ia.modelo && !atual.modelos.includes(ia.modelo)) atual.modelos.push(ia.modelo)
    porProvedor.set(provedor, atual)
  }
  return [...porProvedor.values()]
}

function novoAcumulador(c: Contribuicao): Acumulador {
  return {
    uso: {
      provedor: c.provedor,
      provedorIdentificado: c.provedorIdentificado,
      runs: 0,
      runsComFalha: 0,
      custoUsd: 0,
      tokens: 0,
      modelos: [],
      primeiroEm: '',
      ultimoEm: '',
      janelaViraEm: '',
      janelaViraDaquiMs: 0,
      limiteAtingido: false,
      limiteAtingidoEm: '',
      limiteMotivo: '',
      cardsNoLimite: [],
    },
    primeiroMs: Number.POSITIVE_INFINITY,
    ultimoMs: Number.NEGATIVE_INFINITY,
    limiteMs: Number.NEGATIVE_INFINITY,
  }
}

function oLimiteEDesteProvedor(acc: Acumulador, e: ExecucaoEmDisco): boolean {
  return e.failureClass === 'quota' && e.provider === acc.uso.provedor
}

function anotarLimite(acc: Acumulador, e: ExecucaoEmDisco): void {
  if (!oLimiteEDesteProvedor(acc, e)) return
  acc.uso.limiteAtingido = true
  if (e.cardId && !acc.uso.cardsNoLimite.includes(e.cardId)) acc.uso.cardsNoLimite.push(e.cardId)
  if (e.tsMs < acc.limiteMs) return
  acc.limiteMs = e.tsMs
  acc.uso.limiteAtingidoEm = e.ts
  acc.uso.limiteMotivo = e.failureReason
}

function acumular(acc: Acumulador, e: ExecucaoEmDisco, c: Contribuicao): void {
  acc.uso.runs += 1
  if (c.falhou) acc.uso.runsComFalha += 1
  acc.uso.custoUsd += c.custoUsd
  acc.uso.tokens += c.tokens
  for (const m of c.modelos) if (!acc.uso.modelos.includes(m)) acc.uso.modelos.push(m)
  acc.primeiroMs = Math.min(acc.primeiroMs, e.tsMs)
  acc.ultimoMs = Math.max(acc.ultimoMs, e.tsMs)
  anotarLimite(acc, e)
}

function fechar(acc: Acumulador, agoraMs: number): UsoDeProvedor {
  const viraMs = acc.primeiroMs + JANELA_COTA_MS
  return {
    ...acc.uso,
    custoUsd: Number(acc.uso.custoUsd.toFixed(4)),
    modelos: [...acc.uso.modelos].sort(),
    primeiroEm: new Date(acc.primeiroMs).toISOString(),
    ultimoEm: new Date(acc.ultimoMs).toISOString(),
    janelaViraEm: new Date(viraMs).toISOString(),
    janelaViraDaquiMs: Math.max(0, viraMs - agoraMs),
  }
}

function porGasto(a: UsoDeProvedor, b: UsoDeProvedor): number {
  return b.custoUsd - a.custoUsd || b.tokens - a.tokens || a.provedor.localeCompare(b.provedor)
}

function agrupar(execucoes: ExecucaoEmDisco[]): Map<string, Acumulador> {
  const porProvedor = new Map<string, Acumulador>()
  for (const e of execucoes) {
    for (const c of contribuicoesDe(e)) {
      const atual = porProvedor.get(c.provedor) ?? novoAcumulador(c)
      acumular(atual, e, c)
      porProvedor.set(c.provedor, atual)
    }
  }
  return porProvedor
}

export function lerCota(agoraMs: number = Date.now()): LeituraDeCota {
  const inicioMs = agoraMs - JANELA_COTA_MS
  const lote = lerExecucoes(inicioMs)
  const naJanela = lote.execucoes.filter(e => e.tsMs >= inicioMs && e.tsMs <= agoraMs)
  const provedores = [...agrupar(naJanela).values()].map(acc => fechar(acc, agoraMs)).sort(porGasto)
  return {
    agora: new Date(agoraMs).toISOString(),
    janelaMs: JANELA_COTA_MS,
    inicioDaJanela: new Date(inicioMs).toISOString(),
    provedores,
    custoUsd: Number(provedores.reduce((total, u) => total + u.custoUsd, 0).toFixed(4)),
    tokens: provedores.reduce((total, u) => total + u.tokens, 0),
    runs: naJanela.length,
    runsIgnorados: lote.ignorados,
  }
}
