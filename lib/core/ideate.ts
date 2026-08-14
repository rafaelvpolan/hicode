export interface Lente {
  id: string
  nome: string
  vantagem: string
}

export const LENTES: Lente[] = [
  { id: 'inversao', nome: 'inversão', vantagem: 'Como garantir que isso FALHE? Depois inverta cada item numa solucao.' },
  { id: 'atacante', nome: 'concorrente/atacante', vantagem: 'Voce quer quebrar ou superar isso. Onde ataca primeiro?' },
  { id: 'plantao', nome: '3h da manha', vantagem: 'Voce foi acordado por causa disso em producao. O que queria que existisse?' },
  { id: 'zero', nome: 'US$0 e 1 hora', vantagem: 'Sem orcamento e sem tempo. Qual e a versao que ainda resolve?' },
  { id: 'dez-anos', nome: 'orcamento infinito, 10 anos', vantagem: 'Sem restricao de custo nem prazo. Qual e a forma certa?' },
  { id: 'premissa', nome: 'remocao de premissa', vantagem: 'Liste as premissas embutidas no pedido e remova a mais forte.' },
  { id: 'crianca', nome: 'crianca de 10 anos', vantagem: 'Explique e resolva sem jargao. O que fica obviamente errado?' },
  { id: 'regulador', nome: 'regulador', vantagem: 'Auditoria, privacidade, rastreabilidade e reversibilidade importam mais que elegancia.' },
  { id: 'speedrun', nome: 'speedrunner', vantagem: 'Qual e o atalho que a maioria nao percebe que existe?' },
  { id: 'logistica', nome: 'logistica', vantagem: 'Trate como fluxo de material: fila, gargalo, lote, estoque parado.' },
]

export interface Ideia {
  lente: string
  texto: string
  novidade: number
  viabilidade: number
  aderencia: number
}

export interface Armadilha {
  ideia: string
  porque: string
}

export interface Convergencia {
  shortlist: Ideia[]
  naoObvia: Ideia | null
  armadilhas: Armadilha[]
  provocacao: string
}

export interface EntradaPreflight {
  titulo: string
  objetivo: string
  perfil: string
  override: string
}

export interface Preflight {
  vale: boolean
  motivo: string
}

const HEDGE = /\b(?:rapid\w*|simples|padr\w*|trivial|so\s+troc\w*|apenas|pequen\w*)\b/
const CANONICO = /\b(?:typo|ortograf\w*|renomear|remover|apagar|corrig\w*\s+o?\s*texto|atualiz\w*\s+vers\w*|bump)\b/
const ABERTO = /\b(?:como|melhor\w*|arquitet\w*|desenh\w*|estrateg\w*|abordagem|alternativ\w*|reestrutur\w*|repens\w*|escalab\w*|modelo)\b/

function norm(s: string | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function preflight(e: EntradaPreflight): Preflight {
  if (e.override === 'on') return { vale: true, motivo: 'ligado no card (ideate: on)' }
  if (e.override === 'off') return { vale: false, motivo: 'desligado no card' }
  const texto = ` ${norm(e.titulo)} ${norm(e.objetivo)} `
  if (e.perfil === 'micro' || e.perfil === 'enxuto') {
    return { vale: false, motivo: `perfil ${e.perfil} — mudanca pontual nao precisa de ideacao` }
  }
  if (CANONICO.test(texto)) return { vale: false, motivo: 'tem resposta canonica — nao ha o que divergir' }
  if (HEDGE.test(texto)) return { vale: false, motivo: 'o pedido ja diz que quer o caminho simples' }
  if (!ABERTO.test(texto)) return { vale: false, motivo: 'pedido fechado — nao e pergunta de abordagem' }
  return { vale: true, motivo: 'pedido aberto de abordagem — vale divergir antes de decidir' }
}

export function escolherLentes(quantas: number, semente: string): Lente[] {
  const n = Math.max(1, Math.min(quantas, LENTES.length))
  const base = [...semente].reduce((a, c) => a + c.charCodeAt(0), 0)
  const usadas: Lente[] = []
  for (let i = 0; i < n; i++) {
    const idx = (base + i * 3) % LENTES.length
    const lente = LENTES[(idx + usadas.length) % LENTES.length]
    if (lente && !usadas.includes(lente)) usadas.push(lente)
  }
  for (const l of LENTES) {
    if (usadas.length >= n) break
    if (!usadas.includes(l)) usadas.push(l)
  }
  return usadas.slice(0, n)
}

export function promptDivergir(lente: Lente, objetivo: string, quantas: number): string {
  return [
    `Voce raciocina pela lente: ${lente.nome}.`,
    lente.vantagem,
    '',
    `TAREFA: ${objetivo}`,
    '',
    `Gere ${quantas} ideias DISTINTAS de como resolver, por essa lente.`,
    'As tres primeiras respostas obvias ja foram pensadas — passe delas.',
    'NAO avalie, NAO ranqueie, NAO escolha. Apenas gere.',
    'Responda APENAS um JSON numa linha: {"ideias":["ideia 1","ideia 2"]}',
  ].join('\n')
}

export function promptConvergir(objetivo: string, ideias: Array<{ lente: string; texto: string }>, topK: number): string {
  const lista = ideias.map((i, n) => `${n + 1}. [${i.lente}] ${i.texto}`).join('\n')
  return [
    'Voce e o CRITICO. Nao gerou nenhuma destas ideias — julgue sem apego.',
    `TAREFA: ${objetivo}`,
    '',
    'IDEIAS:',
    lista,
    '',
    `Pontue cada uma de 0 a 10 em novidade, viabilidade e aderencia a tarefa.`,
    `Escolha as ${topK} melhores, marque UMA como nao-obvia-mas-viavel, e liste as ARMADILHAS`,
    '(ideias que parecem boas e vao dar errado, com o porque).',
    'Responda APENAS um JSON numa linha:',
    '{"shortlist":[{"n":1,"novidade":8,"viabilidade":7,"aderencia":9}],"naoObvia":3,"armadilhas":[{"n":2,"porque":"motivo"}],"provocacao":"uma pergunta"}',
  ].join('\n')
}

interface IdeiasBrutas {
  ideias?: string[]
}

export function parseIdeias(texto: string, lente: string): Array<{ lente: string; texto: string }> {
  const m = texto.match(/\{[\s\S]*\}/)
  if (!m?.[0]) return []
  try {
    const j = JSON.parse(m[0]) as IdeiasBrutas
    if (!Array.isArray(j.ideias)) return []
    return j.ideias
      .filter((i): i is string => typeof i === 'string' && i.trim().length > 0)
      .map(i => ({ lente, texto: i.replace(/\s+/g, ' ').trim().slice(0, 300) }))
  } catch {
    return []
  }
}

interface NotaBruta {
  n?: number
  novidade?: number
  viabilidade?: number
  aderencia?: number
}

interface ArmadilhaBruta {
  n?: number
  porque?: string
}

interface VereditoBruto {
  shortlist?: NotaBruta[]
  naoObvia?: number
  armadilhas?: ArmadilhaBruta[]
  provocacao?: string
}

function nota(v: number | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 0
}

export function parseConvergencia(texto: string, ideias: Array<{ lente: string; texto: string }>): Convergencia | null {
  const m = texto.match(/\{[\s\S]*\}/)
  if (!m?.[0]) return null
  try {
    const j = JSON.parse(m[0]) as VereditoBruto
    const pega = (n: number | undefined): { lente: string; texto: string } | undefined => ideias[Number(n) - 1]
    const shortlist: Ideia[] = (j.shortlist ?? [])
      .map((s) => {
        const base = pega(s.n)
        return base ? { ...base, novidade: nota(s.novidade), viabilidade: nota(s.viabilidade), aderencia: nota(s.aderencia) } : null
      })
      .filter((i): i is Ideia => i !== null)
    const alvo = pega(j.naoObvia)
    return {
      shortlist,
      naoObvia: alvo ? (shortlist.find(s => s.texto === alvo.texto) ?? { ...alvo, novidade: 0, viabilidade: 0, aderencia: 0 }) : null,
      armadilhas: (j.armadilhas ?? [])
        .map((a) => {
          const base = pega(a.n)
          return base ? { ideia: base.texto, porque: String(a.porque ?? '').slice(0, 200) } : null
        })
        .filter((a): a is Armadilha => a !== null),
      provocacao: String(j.provocacao ?? '').slice(0, 200),
    }
  } catch {
    return null
  }
}

export function pontuacao(i: Ideia): number {
  return i.viabilidade * 2 + i.aderencia * 2 + i.novidade
}

export function ordenar(shortlist: Ideia[]): Ideia[] {
  return [...shortlist].sort((a, b) => pontuacao(b) - pontuacao(a))
}

export function comoOpcoes(c: Convergencia, max = 4): string[] {
  return ordenar(c.shortlist).slice(0, max).map(i => `[${i.lente}] ${i.texto.slice(0, 110)}`)
}
