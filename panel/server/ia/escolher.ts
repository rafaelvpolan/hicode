import type { AgentRole } from './tipos'
import { ler, gravar } from './preferencias'
import { agentRoles } from './provedores'

export interface ResultadoEscolha {
  ok: boolean
  mensagem: string
}

export interface Ajuste {
  papeis: AgentRole[]
  provider?: string
  model?: string
  effort?: string
}

export function aplicar(ajuste: Ajuste): ResultadoEscolha {
  const prefs = ler()
  for (const papel of ajuste.papeis) {
    const atual = prefs[papel] ?? {}
    if (ajuste.provider) atual.provider = ajuste.provider
    if (ajuste.model !== undefined) atual.model = ajuste.model || undefined
    if (ajuste.effort) atual.effort = ajuste.effort
    prefs[papel] = atual
  }
  gravar(prefs)
  const mudou = [
    ajuste.provider ? `ia ${ajuste.provider}` : '',
    ajuste.model ? `modelo ${ajuste.model}` : '',
    ajuste.effort ? `esforco ${ajuste.effort}` : '',
  ].filter(Boolean).join(' · ')
  const onde = ajuste.papeis.length === agentRoles().length ? 'todos os papeis' : ajuste.papeis.join(', ')
  return { ok: true, mensagem: `${mudou} — ${onde} (vale na proxima tarefa, sem reiniciar)` }
}

export function limpar(papeis: AgentRole[]): ResultadoEscolha {
  const prefs = ler()
  for (const p of papeis) delete prefs[p]
  gravar(prefs)
  return { ok: true, mensagem: `voltou ao padrao: ${papeis.join(', ')}` }
}
