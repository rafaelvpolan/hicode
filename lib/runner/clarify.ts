import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { extractObjetivo } from '../card'
import type { Card, ClarifyQuestion } from '../card'
import { cardsDir, ROOT } from './config'
import { providerFor, modelFor } from '../ai/registry'
import { runProvider } from './cost-trust'
import { preflight, comoOpcoes } from '../core/ideate'
import { idear } from './ideate-run'
import { sumTokens } from '../ai/usage'

export interface ClarifyResult {
  questions: ClarifyQuestion[]
  cost: number
  tokens: number
  falhou?: string
}

function clarifyFile(id: string): string {
  return join(cardsDir(), 'runs', `${id}.clarify.json`)
}

export function readClarify(id: string): ClarifyQuestion[] {
  const f = clarifyFile(id)
  if (!existsSync(f)) return []
  try {
    const parsed = JSON.parse(readFileSync(f, 'utf8')) as ClarifyQuestion[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeClarify(id: string, questions: ClarifyQuestion[]): void {
  const dir = join(cardsDir(), 'runs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(clarifyFile(id), JSON.stringify(questions, null, 2))
}

export function clarifyAnswersPrompt(id: string): string {
  const answered = readClarify(id).filter(q => q.answer)
  if (!answered.length) return ''
  return 'DECISOES DO HUMANO (respeite exatamente estas escolhas):\n' + answered.map(q => `- ${q.q} -> ${q.answer}`).join('\n') + '\n'
}

function parseQuestions(text: string): ClarifyQuestion[] {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return []
  try {
    const j = JSON.parse(m[0]) as { questions?: ClarifyQuestion[] }
    if (!Array.isArray(j.questions)) return []
    return j.questions
      .filter(q => q && q.q)
      .slice(0, 3)
      .map(q => ({
        q: String(q.q).slice(0, 240),
        options: (Array.isArray(q.options) ? q.options : []).map(o => String(o).slice(0, 120)).filter(Boolean).slice(0, 4),
        recommended: String(q.recommended || ''),
      }))
      .filter(q => q.options.length >= 2)
  } catch {
    return []
  }
}

export interface IdeacaoNoClarify {
  perguntas: ClarifyQuestion[]
  cost: number
  tokens: number
  motivo: string
}

export async function clarifyPorIdeacao(card: Card, perfil: string): Promise<IdeacaoNoClarify> {
  const objetivo = extractObjetivo(card.body) || card.fm.title || ''
  const gate = preflight({ titulo: card.fm.title ?? '', objetivo, perfil, override: card.fm.ideate ?? '' })
  if (!gate.vale) return { perguntas: [], cost: 0, tokens: 0, motivo: gate.motivo }
  const r = await idear(objetivo, card.fm.id ?? '')
  if (!r.ok || !r.convergencia) {
    return { perguntas: [], cost: r.cost, tokens: r.tokens, motivo: `ideacao nao concluiu: ${r.motivo}` }
  }
  const opcoes = comoOpcoes(r.convergencia, 4)
  if (opcoes.length < 2) {
    return { perguntas: [], cost: r.cost, tokens: r.tokens, motivo: 'ideacao rendeu menos de duas opcoes' }
  }
  const armadilha = r.convergencia.armadilhas[0]
  const pergunta: ClarifyQuestion = {
    q: `Qual abordagem seguir?${armadilha ? ` (evitar: ${armadilha.ideia.slice(0, 60)} — ${armadilha.porque.slice(0, 80)})` : ''}`,
    options: opcoes,
    recommended: opcoes[0] ?? '',
  }
  return { perguntas: [pergunta], cost: r.cost, tokens: r.tokens, motivo: r.motivo }
}

export async function clarify(card: Card): Promise<ClarifyResult> {
  const desc = extractObjetivo(card.body) || card.fm.title || ''
  const provider = providerFor('verify')
  const prompt = [
    'Voce recebe uma tarefa de desenvolvimento web. Se ela ja estiver CLARA o bastante para implementar sem suposicoes, responda exatamente {"questions":[]}.',
    'So pergunte se houver ambiguidade REAL que mudaria a implementacao (escopo, aparencia, comportamento ou dados). No maximo 3 perguntas.',
    'Cada pergunta deve ter de 2 a 4 opcoes objetivas e indicar a opcao recomendada.',
    'Responda APENAS um JSON em uma linha, sem texto extra: {"questions":[{"q":"pergunta","options":["op1","op2"],"recommended":"op1"}]}',
    '',
    `TAREFA: ${desc}`,
  ].join('\n')
  const res = await runProvider(card.fm.id ?? '', provider, { prompt, cwd: ROOT, dirs: [], mode: 'readonly', useAgents: false, model: modelFor('verify'), timeoutMs: 120000 })
  if (!res.ok) {
    return {
      questions: [],
      cost: res.cost,
      tokens: sumTokens(res.usage),
      falhou: `provedor nao respondeu: ${String(res.detail || res.text || 'sem detalhe').slice(0, 120)}`,
    }
  }
  return { questions: parseQuestions(res.text), cost: res.cost, tokens: sumTokens(res.usage) }
}
