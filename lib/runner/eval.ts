import { extractObjetivo } from '../card'
import type { Card } from '../card'
import { ROOT, GATE_DIFF_LIMIT } from './config'
import { runGit } from './git'
import { providerFor, modelFor } from '../ai/registry'
import { sumTokens } from '../ai/usage'

export interface EvalResult {
  score: number
  meets: boolean
  notes: string
  cost: number
  tokens: number
}

export async function evaluate(card: Card, wt: string, base: string): Promise<EvalResult> {
  const desc = extractObjetivo(card.body) || card.fm.title || ''
  const diff = (await runGit(wt, ['diff', `origin/${base}`, '--', '.', ':!node_modules'])).stdout.slice(0, GATE_DIFF_LIMIT)
  const provider = providerFor('verify')
  const prompt = [
    'Voce e um avaliador de qualidade de codigo. Dada a TAREFA e o DIFF abaixo, avalie o quanto o diff cumpre a tarefa e com que qualidade.',
    'Responda APENAS um JSON em uma linha, sem texto extra: {"score": 0-5, "meets": true ou false, "notes": "uma frase curta"}.',
    'score: 0 (nao cumpre / vazio) a 5 (cumpre com qualidade). meets: o objetivo foi atingido? notes: o essencial em uma frase.',
    '',
    `TAREFA: ${desc}`,
    '',
    'DIFF:',
    diff || '(sem diff vs a base)',
  ].join('\n')
  const res = await provider.run({ prompt, cwd: ROOT, dirs: [wt], mode: 'readonly', useAgents: false, model: modelFor('verify'), timeoutMs: 120000 })
  const tokens = sumTokens(res.usage)
  const m = res.text.match(/\{[\s\S]*?\}/)
  if (m && m[0]) {
    try {
      const j = JSON.parse(m[0]) as { score?: number; meets?: boolean; notes?: string }
      return {
        score: Math.max(0, Math.min(5, Math.round(Number(j.score) || 0))),
        meets: !!j.meets,
        notes: String(j.notes || '').replace(/\s+/g, ' ').slice(0, 240),
        cost: res.cost,
        tokens,
      }
    } catch {
      void 0
    }
  }
  return { score: 0, meets: false, notes: 'eval inconclusivo (sem veredito parseavel)', cost: res.cost, tokens }
}
