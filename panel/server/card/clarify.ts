import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ClarifyQuestion } from '#shared/types'
import { cardsDir } from '../motor/ambiente'

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


export interface ClarifyAnswer { q: string; answer: string }

export function validarRespostasClarify(questions: ClarifyQuestion[], answers: ClarifyAnswer[] | undefined): { ok: true; answers: ClarifyAnswer[] } | { ok: false; error: string } {
  if (!Array.isArray(answers) || answers.length === 0) return { ok: false, error: 'Preencha todas as respostas antes de enviar.' }
  const normalizadas: ClarifyAnswer[] = []
  for (const value of answers) {
    if (!value || typeof value !== 'object') return { ok: false, error: 'Formato de resposta inválido.' }
    const q = typeof (value as ClarifyAnswer).q === 'string' ? (value as ClarifyAnswer).q.trim() : ''
    const answer = typeof (value as ClarifyAnswer).answer === 'string' ? (value as ClarifyAnswer).answer.trim() : ''
    if (!q || !answer) return { ok: false, error: 'Preencha todas as respostas antes de enviar.' }
    if (normalizadas.some(item => item.q === q)) return { ok: false, error: `A pergunta "${q}" foi respondida mais de uma vez.` }
    normalizadas.push({ q, answer })
  }
  const esperadas = questions.map(item => item.q.trim()).filter(Boolean)
  const desconhecida = esperadas.length ? normalizadas.find(item => !esperadas.includes(item.q)) : undefined
  if (desconhecida) return { ok: false, error: `Pergunta desconhecida: "${desconhecida.q}". Atualize o painel e tente novamente.` }
  const ausente = esperadas.find(q => !normalizadas.some(item => item.q === q))
  if (ausente) return { ok: false, error: `Falta responder: "${ausente}".` }
  return { ok: true, answers: normalizadas }
}
