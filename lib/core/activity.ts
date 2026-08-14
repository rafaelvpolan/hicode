export type TipoAtividade = 'sessao' | 'agente' | 'skill' | 'arquivo' | 'shell' | 'busca' | 'mcp' | 'texto' | 'fim'

export interface Atividade {
  tipo: TipoAtividade
  nome: string
  alvo: string
  ts: string
}

export interface EntradaFerramenta {
  subagent_type?: string
  skill?: string
  name?: string
  description?: string
  prompt?: string
  args?: string
  file_path?: string
  path?: string
  notebook_path?: string
  command?: string
  pattern?: string
  query?: string
  url?: string
}

export interface EventoBruto {
  ferramenta: string
  entrada: EntradaFerramenta
}

const ARQUIVO = ['Read', 'Edit', 'Write', 'NotebookEdit', 'MultiEdit']
const BUSCA = ['Grep', 'Glob', 'WebSearch', 'WebFetch']
const CHAVES: Array<keyof EntradaFerramenta> = [
  'subagent_type', 'skill', 'name', 'description', 'prompt', 'args',
  'file_path', 'path', 'notebook_path', 'command', 'pattern', 'query', 'url',
]

function curto(s: string | undefined, max = 60): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

function base(caminho: string | undefined): string {
  return String(caminho ?? '').split('/').slice(-2).join('/')
}

export function classificar(ev: EventoBruto, ts = ''): Atividade {
  const f = ev.ferramenta
  const e = ev.entrada
  if (f === 'Task') {
    return { tipo: 'agente', nome: e.subagent_type || e.description || 'agente', alvo: curto(e.description || e.prompt), ts }
  }
  if (f === 'Skill') {
    return { tipo: 'skill', nome: e.skill || e.name || 'skill', alvo: curto(e.args), ts }
  }
  if (ARQUIVO.includes(f)) {
    return { tipo: 'arquivo', nome: f.toLowerCase(), alvo: base(e.file_path || e.path || e.notebook_path), ts }
  }
  if (f === 'Bash') {
    return { tipo: 'shell', nome: 'bash', alvo: curto(e.command || e.description), ts }
  }
  if (BUSCA.includes(f)) {
    return { tipo: 'busca', nome: f.toLowerCase(), alvo: curto(e.pattern || e.query || e.url), ts }
  }
  if (f.startsWith('mcp__')) {
    const partes = f.split('__')
    return { tipo: 'mcp', nome: partes[1] ?? 'mcp', alvo: partes[2] ?? '', ts }
  }
  return { tipo: 'texto', nome: f, alvo: curto(e.description || e.prompt), ts }
}

const RE_TOOL = /^\s*→\s*([A-Za-z_][\w]*)\((.*)$/
const RE_SESSAO = /^—\s*sessao iniciada(?:\s*\(([^)]+)\))?/
const RE_FIM = /^—\s*concluido \(custo \$([0-9.]+)\)/
const RE_TIMEOUT = /^—\s*TIMEOUT/

function entradaDe(bruto: string): EntradaFerramenta {
  const limpo = bruto.replace(/…$/, '')
  try {
    const j = JSON.parse(limpo) as EntradaFerramenta
    const out: EntradaFerramenta = {}
    for (const k of CHAVES) {
      const v = j[k]
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    const out: EntradaFerramenta = {}
    for (const k of CHAVES) {
      const m = limpo.match(new RegExp(`"${k}"\\s*:\\s*"([^"]*)"`))
      if (m?.[1]) out[k] = m[1]
    }
    return out
  }
}

export function parseLinha(linha: string, ts = ''): Atividade | null {
  const sessao = linha.match(RE_SESSAO)
  if (sessao) return { tipo: 'sessao', nome: 'sessao', alvo: sessao[1] ?? '', ts }
  const fim = linha.match(RE_FIM)
  if (fim) return { tipo: 'fim', nome: 'concluido', alvo: `US$${fim[1]}`, ts }
  if (RE_TIMEOUT.test(linha)) return { tipo: 'fim', nome: 'timeout', alvo: '', ts }
  const tool = linha.match(RE_TOOL)
  if (tool?.[1]) {
    const bruto = (tool[2] ?? '').replace(/\)\s*$/, '')
    return classificar({ ferramenta: tool[1], entrada: entradaDe(bruto) }, ts)
  }
  if (linha.trimStart().startsWith('←')) return null
  const texto = linha.trim()
  return texto ? { tipo: 'texto', nome: '', alvo: curto(texto, 90), ts } : null
}

export function parseLog(conteudo: string): Atividade[] {
  return conteudo.split('\n').map(l => parseLinha(l)).filter((a): a is Atividade => a !== null)
}

const ICONE: Record<TipoAtividade, string> = {
  sessao: '◇',
  agente: '◆',
  skill: '✦',
  arquivo: '·',
  shell: '$',
  busca: '?',
  mcp: '⊞',
  texto: ' ',
  fim: '◇',
}

export function formatar(a: Atividade): string {
  const icone = ICONE[a.tipo]
  if (a.tipo === 'agente') return `${icone} agente ${a.nome}${a.alvo ? ` — ${a.alvo}` : ''}`
  if (a.tipo === 'skill') return `${icone} skill ${a.nome}${a.alvo ? ` ${a.alvo}` : ''}`
  if (a.tipo === 'texto') return a.nome ? `${icone} ${a.nome} ${a.alvo}` : `  ${a.alvo}`
  return `${icone} ${a.nome}${a.alvo ? ` ${a.alvo}` : ''}`
}

export function agentesUsados(atividades: Atividade[]): string[] {
  return [...new Set(atividades.filter(a => a.tipo === 'agente').map(a => a.nome))]
}

export function ultimoAgente(atividades: Atividade[]): string {
  const so = atividades.filter(a => a.tipo === 'agente')
  return so[so.length - 1]?.nome ?? ''
}

export function ultimaAcao(atividades: Atividade[]): string {
  const uteis = atividades.filter(a => a.tipo !== 'texto' && a.tipo !== 'sessao' && a.tipo !== 'fim')
  const ultima = uteis[uteis.length - 1]
  if (!ultima) return ''
  const alvo = ultima.alvo ? ` ${ultima.alvo.split('/').pop() ?? ultima.alvo}` : ''
  return `${ultima.nome}${alvo}`.slice(0, 40)
}

export function resumo(atividades: Atividade[]): string {
  const conta = (t: TipoAtividade): number => atividades.filter(a => a.tipo === t).length
  const agentes = agentesUsados(atividades)
  return [
    agentes.length ? agentes.join(', ') : '',
    conta('skill') ? `${conta('skill')} skill(s)` : '',
    conta('arquivo') ? `${conta('arquivo')} arquivo(s)` : '',
    conta('shell') ? `${conta('shell')} comando(s)` : '',
    conta('busca') ? `${conta('busca')} busca(s)` : '',
  ].filter(Boolean).join(' · ')
}
