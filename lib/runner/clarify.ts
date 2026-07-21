import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { extractObjetivo } from '../card'
import type { Card, ClarifyQuestion } from '../card'
import { CARDS_DIR, ROOT } from './config'
import { providerFor, modelFor } from '../ai/registry'
import { sumTokens } from '../ai/usage'

export interface ClarifyResult {
  questions: ClarifyQuestion[]
  cost: number
  tokens: number
}

function clarifyFile(id: string): string {
  return join(CARDS_DIR, 'runs', `${id}.clarify.json`)
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
  const dir = join(CARDS_DIR, 'runs')
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
  const res = await provider.run({ prompt, cwd: ROOT, dirs: [], mode: 'readonly', useAgents: false, model: modelFor('verify'), timeoutMs: 120000 })
  if (!res.ok) return { questions: [], cost: res.cost, tokens: sumTokens(res.usage) }
  return { questions: parseQuestions(res.text), cost: res.cost, tokens: sumTokens(res.usage) }
}
