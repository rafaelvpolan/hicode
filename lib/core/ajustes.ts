import { agentRoles, providerNames, providerNameFor, modelFor, effortFor } from '../ai/registry'
import { ESFORCOS } from '../ai/preferencias'
import { aplicar } from './escolher-ia'
import type { AgentRole } from '../ai/types'

export type TipoDeAjuste = 'ia' | 'esforco'

export interface ItemDeAjuste {
  chave: string
  papel: AgentRole
  tipo: TipoDeAjuste
  rotulo: string
  valor: string
  opcoes: string[]
}

const PAPEL_ROTULO: Record<string, string> = {
  implement: 'executa',
  verify: 'verifica',
  gate: 'revisa',
  step: 'poli',
}

export function itensDeAjuste(): ItemDeAjuste[] {
  const provedores = providerNames() as string[]
  const esforcos = [...ESFORCOS] as string[]
  return agentRoles().flatMap((papel): ItemDeAjuste[] => {
    const rotulo = PAPEL_ROTULO[papel] ?? papel
    const modelo = modelFor(papel)
    return [
      {
        chave: `${papel}:ia`,
        papel,
        tipo: 'ia',
        rotulo: `${rotulo} · ia`,
        valor: modelo ? `${providerNameFor(papel)}/${modelo}` : providerNameFor(papel),
        opcoes: provedores,
      },
      {
        chave: `${papel}:esforco`,
        papel,
        tipo: 'esforco',
        rotulo: `${rotulo} · esforco`,
        valor: effortFor(papel) ?? '(padrao)',
        opcoes: esforcos,
      },
    ]
  })
}

export function ordemDosAjustes(): string[] {
  return itensDeAjuste().map(i => i.chave)
}

export interface ResultadoDeCiclo {
  ok: boolean
  mensagem: string
}

export function ciclarAjuste(chave: string, dir: -1 | 1): ResultadoDeCiclo {
  const item = itensDeAjuste().find(i => i.chave === chave)
  if (!item) return { ok: false, mensagem: 'nada selecionado para trocar' }
  if (item.opcoes.length < 2) return { ok: false, mensagem: `so ha uma opcao de ${item.tipo}` }

  const atual = item.tipo === 'ia' ? providerNameFor(item.papel) : (effortFor(item.papel) ?? '')
  const i = item.opcoes.indexOf(atual)
  const proximo = item.opcoes[((i < 0 ? 0 : i) + dir + item.opcoes.length) % item.opcoes.length]
  if (!proximo) return { ok: false, mensagem: 'nao consegui trocar' }

  aplicar(item.tipo === 'ia'
    ? { papeis: [item.papel], provider: proximo, model: '' }
    : { papeis: [item.papel], effort: proximo })

  return { ok: true, mensagem: `${item.rotulo}: ${proximo} — vale na proxima instrucao` }
}
