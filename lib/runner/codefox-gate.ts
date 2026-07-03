import { isoNow } from '../card'
import { GATE_MODEL, GATE_DIFF_LIMIT, ROOT } from './config'
import { run, runGit } from './git'
import { patchCard } from './card-store'

export type GateVerdict = 'APPROVED' | 'CONDITIONAL' | 'BLOCKED'

export interface GateResult {
  ok: boolean
  verdict: GateVerdict
  reason: string
  questions: string[]
  cost: number
  tokens: number
}

interface ClaudeJson {
  total_cost_usd?: number
  result?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
  }
}

interface RawVerdict {
  verdict?: string
  reason?: string
  questions?: string[]
}

interface DiffParts {
  names: string
  patch: string
}

interface ParsedGate {
  found: boolean
  verdict: GateVerdict
  reason: string
  questions: string[]
  cost: number
  tokens: number
}

function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim()
}

function normalizeVerdict(v: string): GateVerdict {
  const u = v.trim().toUpperCase()
  if (u === 'BLOCKED' || u === 'APPROVED') return u
  return 'CONDITIONAL'
}

function extractVerdictJson(text: string): RawVerdict | null {
  const objs: string[] = []
  let depth = 0
  let start = -1
  let inStr = false
  let esc = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === '{') { if (depth === 0) start = i; depth++ }
    else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) { objs.push(text.slice(start, i + 1)); start = -1 }
    }
  }
  for (let k = objs.length - 1; k >= 0; k--) {
    try {
      const o = JSON.parse(objs[k] ?? '') as RawVerdict
      if (o && typeof o.verdict === 'string') return o
    } catch { void 0 }
  }
  return null
}

async function accumulatedDiff(wt: string, base: string): Promise<DiffParts> {
  const names = (await runGit(wt, ['diff', '--name-status', `origin/${base}...HEAD`])).stdout.trim()
  const raw = (await runGit(wt, ['diff', `origin/${base}...HEAD`])).stdout
  const patch = raw.length > GATE_DIFF_LIMIT ? raw.slice(0, GATE_DIFF_LIMIT) + '\n[...diff truncado...]' : raw
  return { names, patch }
}

function buildPrompt(desc: string, diff: DiffParts): string {
  return [
    'Voce e o CRIVO — revisor adversarial read-only. Revise o diff ACUMULADO abaixo (toda a cadeia de alteracoes da branch vs a base) contra a tarefa e os padroes do hicode.',
    'PADROES: tudo tipado strict, proibido any/unknown; arquivo <=350 linhas e nunca god-file; sem comentario de prosa; Vue 3 Composition API (nunca React); erro nunca silenciado; merge sempre humano.',
    'Julgue a COSTURA entre etapas: uma refatoracao desfez a feature? acoplamento espalhado? cenario sem cobertura? regressao?',
    `TAREFA (objetivo do card): "${desc}"`,
    '',
    `ARQUIVOS ALTERADOS:\n${diff.names}`,
    '',
    `DIFF:\n${diff.patch}`,
    '',
    'Emita 1-3 PERGUNTAS que forcem o revisor humano a LER o diff antes do merge (anti-rendicao-cognitiva) — coisas que so quem leu o diff sabe responder.',
    'Responda APENAS um JSON em uma unica linha, sem prosa antes ou depois:',
    '{"verdict":"APPROVED|CONDITIONAL|BLOCKED","reason":"motivo curto","questions":["p1","p2"]}',
    'BLOCKED apenas para defeito real/regressao/violacao de alta confianca. Em duvida, CONDITIONAL.',
  ].join('\n')
}

function parseGate(stdout: string): ParsedGate {
  let cost = 0
  let tokens = 0
  try {
    const j = JSON.parse(stdout) as ClaudeJson
    cost = Number(j.total_cost_usd) || 0
    const u = j.usage || {}
    tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0)
    const v = extractVerdictJson(String(j.result || ''))
    if (v) {
      const questions = Array.isArray(v.questions)
        ? v.questions.map(q => oneLine(String(q)).slice(0, 240)).filter(Boolean).slice(0, 3)
        : []
      return { found: true, verdict: normalizeVerdict(String(v.verdict || 'CONDITIONAL')), reason: oneLine(String(v.reason || '')).slice(0, 240), questions, cost, tokens }
    }
  } catch { void 0 }
  return { found: false, verdict: 'CONDITIONAL', reason: '', questions: [], cost, tokens }
}

export async function runCodefoxGate(wt: string, base: string, desc: string): Promise<GateResult> {
  const diff = await accumulatedDiff(wt, base)
  if (!diff.names.trim()) {
    return { ok: true, verdict: 'APPROVED', reason: 'sem mudancas vs a base', questions: [], cost: 0, tokens: 0 }
  }
  const { err, stdout } = await run('claude', [
    '-p', buildPrompt(desc, diff),
    '--output-format', 'json', '--model', GATE_MODEL,
    '--add-dir', wt, '--allowedTools', 'Read,Glob,Grep',
  ], { cwd: ROOT, timeout: 180000 })
  const parsed = parseGate(stdout)
  if (err) {
    return { ok: false, verdict: 'CONDITIONAL', reason: `gate NAO executou (${err.killed ? 'timeout' : 'erro'}): ${oneLine(String(err.message || '')).slice(0, 120)}`, questions: [], cost: parsed.cost, tokens: parsed.tokens }
  }
  if (!parsed.found) {
    return { ok: false, verdict: 'CONDITIONAL', reason: 'gate sem veredito parseavel na saida (revisar manualmente)', questions: [], cost: parsed.cost, tokens: parsed.tokens }
  }
  return { ok: true, verdict: parsed.verdict, reason: parsed.reason, questions: parsed.questions, cost: parsed.cost, tokens: parsed.tokens }
}

export function persistGate(id: string, gate: GateResult): void {
  const flag = gate.ok ? '' : ' [gate nao concluido]'
  patchCard(id, {
    review_verdict: gate.verdict,
    review_reason: oneLine(gate.reason).slice(0, 240),
    review_questions: JSON.stringify(gate.questions),
  }, `${isoNow()} codefox gate: ${gate.verdict}${flag} — ${oneLine(gate.reason)} (custo $${gate.cost.toFixed(4)} · ${gate.tokens} tokens)`)
  process.stdout.write(`[runner] #${id}: codefox gate ${gate.verdict}${flag}\n`)
}

export function buildPrBody(id: string, desc: string, gate: GateResult): string {
  const questions = gate.questions.length
    ? '\n\n**Perguntas ao revisor — responda antes do merge:**\n' + gate.questions.map(q => `- [ ] ${oneLine(q)}`).join('\n')
    : ''
  return [
    `Gerado pelo motor hicode (agentes Nexus). Card #${id}.`,
    '',
    (desc || '').slice(0, 500),
    '',
    `**Codefox review:** ${gate.verdict}${gate.ok ? '' : ' (gate nao concluido — revisar manualmente)'} — ${oneLine(gate.reason)}`,
    questions,
  ].join('\n')
}
