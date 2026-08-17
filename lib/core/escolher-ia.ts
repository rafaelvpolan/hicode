import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { arquivoDePreferencias, ehEsforco, ESFORCOS } from '../ai/preferencias'
import type { PreferenciasDeIa } from '../ai/preferencias'
import { agentRoles, isProviderName, providerNames, providerNameFor, effortFor } from '../ai/registry'
import { provedoresDisponiveis } from '../ai/disponibilidade'
import { modelosDe, arquivoDoCatalogo } from '../ai/catalogo'
import type { AgentRole } from '../ai/types'

export interface ResultadoEscolha {
  ok: boolean
  mensagem: string
}

function ehPapel(valor: string): valor is AgentRole {
  return (agentRoles() as string[]).includes(valor)
}

function ler(): PreferenciasDeIa {
  const f = arquivoDePreferencias()
  if (!existsSync(f)) return {}
  try {
    const cru = JSON.parse(readFileSync(f, 'utf8')) as PreferenciasDeIa
    return cru && typeof cru === 'object' ? cru : {}
  } catch {
    return {}
  }
}

function gravar(prefs: PreferenciasDeIa): void {
  const f = arquivoDePreferencias()
  const dir = dirname(f)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = `${f}.tmp.${process.pid}`
  writeFileSync(tmp, `${JSON.stringify(prefs, null, 2)}\n`)
  writeFileSync(f, readFileSync(tmp, 'utf8'))
  try { writeFileSync(tmp, '') } catch { void 0 }
}

export interface Ajuste {
  papeis: AgentRole[]
  provider?: string
  model?: string
  effort?: string
}

export function interpretar(argumentos: string[]): { ajuste?: Ajuste; erro?: string } {
  const partes = argumentos.filter(Boolean)
  if (!partes.length) return { erro: '' }
  const papeis: AgentRole[] = []
  let provider: string | undefined
  let model: string | undefined
  let effort: string | undefined

  for (const bruto of partes) {
    const p = bruto.trim()
    if (ehPapel(p)) { papeis.push(p); continue }
    if (isProviderName(p)) { provider = p; continue }
    if (ehEsforco(p)) { effort = p; continue }
    if (p.startsWith('modelo=') || p.startsWith('model=')) { model = p.split('=')[1] ?? ''; continue }
    if (!model) { model = p; continue }
    return { erro: `nao entendi "${p}"` }
  }

  if (!provider && !model && !effort) {
    return { erro: 'diga ao menos um: provedor, modelo= ou esforco' }
  }
  return { ajuste: { papeis: papeis.length ? papeis : agentRoles(), provider, model, effort } }
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

export function ciclarIa(role: AgentRole, dir: -1 | 1): ResultadoEscolha {
  const nomes = providerNames()
  if (nomes.length < 2) return { ok: false, mensagem: 'so ha um provedor configurado' }
  const prefs = ler()
  const atual = prefs[role]?.provider
  const i = atual ? nomes.indexOf(atual as typeof nomes[number]) : -1
  const proximo = nomes[((i < 0 ? 0 : i) + dir + nomes.length) % nomes.length]
  if (!proximo) return { ok: false, mensagem: 'nao consegui trocar de provedor' }
  const anterior = prefs[role] ?? {}
  prefs[role] = { ...anterior, provider: proximo, model: undefined }
  gravar(prefs)
  return { ok: true, mensagem: `${role}: ${proximo} — vale na proxima instrucao` }
}

export function estadoDaIa(): string[] {
  const provedores = provedoresDisponiveis()
  const largura = provedores.reduce((a, p) => Math.max(a, p.nome.length), 0)
  const linhas = ['', '  provedores']
  const rotulo: Record<string, string> = {
    disponivel: 'instalado',
    ausente: 'NAO instalado',
    'precisa-servidor': 'precisa do servidor no ar',
  }
  for (const p of provedores) {
    const uso = p.papeis.length ? `em uso: ${p.papeis.join(', ')}` : 'nenhum papel'
    const modelo = p.modelo ? p.modelo : 'modelo padrao do CLI'
    linhas.push(`    ${p.nome.padEnd(largura)}  ${(rotulo[p.situacao] ?? '').padEnd(26)}  ${modelo} · ${uso}`)
    if (p.situacao === 'ausente') linhas.push(`    ${' '.repeat(largura)}  ${p.comoObter}`)
  }
  linhas.push('', '  papeis')
  for (const item of itensPorPapel()) linhas.push(`    ${item}`)
  return linhas
}

function itensPorPapel(): string[] {
  const prefs = ler()
  return agentRoles().map((papel) => {
    const p = prefs[papel]
    const partes = [
      providerNameFor(papel),
      p?.model ?? '',
      `esforco ${effortFor(papel) ?? '(padrao)'}`,
      p ? '' : '(vindo da env ou do padrao)',
    ].filter(Boolean)
    return `${papel.padEnd(10)}  ${partes.join(' · ')}`
  })
}

export function papelAlvo(partes: string[]): { papel: AgentRole; resto: string[] } {
  const primeiro = partes[0] ?? ''
  if (ehPapel(primeiro)) return { papel: primeiro, resto: partes.slice(1) }
  return { papel: 'implement', resto: partes }
}

export function definirModelo(partes: string[]): ResultadoEscolha {
  const { papel, resto } = papelAlvo(partes)
  const provedor = providerNameFor(papel)
  const escolhido = (resto[0] ?? '').trim()
  if (!escolhido) {
    const opcoes = modelosDe(provedor)
    return {
      ok: false,
      mensagem: opcoes.length
        ? `modelos de ${provedor}: ${opcoes.join(' · ')} — use /model <nome>`
        : `nao conheco modelos de ${provedor} — liste em ${arquivoDoCatalogo()} ou use /model <nome> direto`,
    }
  }
  if (escolhido === 'padrao' || escolhido === 'reset') {
    aplicar({ papeis: [papel], model: '' })
    return { ok: true, mensagem: `${papel}: modelo padrao de ${provedor}` }
  }
  const conhecido = modelosDe(provedor).includes(escolhido)
  aplicar({ papeis: [papel], model: escolhido })
  return {
    ok: true,
    mensagem: `${papel}: ${provedor}/${escolhido}${conhecido ? '' : ' (fora do catalogo — se funcionar, adicione ao arquivo)'}`,
  }
}

export function definirEsforco(partes: string[]): ResultadoEscolha {
  const { papel, resto } = papelAlvo(partes)
  const escolhido = (resto[0] ?? '').trim()
  if (!escolhido) {
    return { ok: false, mensagem: `esforco: ${ESFORCOS.join(' · ')} · padrao — use /effort <nivel>` }
  }
  if (escolhido === 'padrao' || escolhido === 'reset') {
    const prefs = ler()
    const atual = prefs[papel]
    if (atual) { delete atual.effort; prefs[papel] = atual; gravar(prefs) }
    return { ok: true, mensagem: `${papel}: esforco volta ao padrao do CLI` }
  }
  if (!ehEsforco(escolhido)) {
    return { ok: false, mensagem: `"${escolhido}" nao e esforco valido — use: ${ESFORCOS.join(' · ')}` }
  }
  aplicar({ papeis: [papel], effort: escolhido })
  return { ok: true, mensagem: `${papel}: esforco ${escolhido} em ${providerNameFor(papel)}` }
}

export function ajuda(): string[] {
  return [
    '',
    `  provedores: ${providerNames().join(' · ')}`,
    `  papeis: ${agentRoles().join(' · ')}`,
    `  esforco: ${ESFORCOS.join(' · ')}`,
    '',
    '  /ia claude                      troca a ia (todos os papeis)',
    '  /ia gate codex                  troca a ia so do gate',
    '  /model opus                     modelo da ia atual (papel implement)',
    '  /model gate opus                modelo da ia do gate',
    '  /model padrao                   volta ao modelo padrao do CLI',
    '  /effort high                    esforco da ia atual',
    '  /effort gate max                esforco do gate',
    '  /ia padrao gate                 volta o gate ao padrao',
  ]
}
