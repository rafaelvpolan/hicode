import { isoNow } from '../card'
import type { FailureClass } from '../card'
import { GATE_DIFF_LIMIT, GATE_RETRIES, GATE_TIMEOUT_MAX_MS, GATE_TIMEOUT_MIN_MS, GATE_TIMEOUT_MS_PER_KB, ROOT } from './config'
import { runGit, stageAll } from './git'
import { patchCard } from './card-store'
import { modelFor, providerFor, effortFor } from '../ai/registry'
import { runProvider } from './cost-trust'
import { sumTokens } from '../ai/usage'
import { classifyFailure } from '../ai/failure'

export type GateVerdict = 'APPROVED' | 'CONDITIONAL' | 'BLOCKED'

export interface GateResult {
  ok: boolean
  verdict: GateVerdict
  reason: string
  questions: string[]
  cost: number
  costMeasured: boolean
  tokens: number
  failureClass?: FailureClass
  failureReason?: string
  provider?: string
}

interface RawVerdict {
  verdict?: string
  reason?: string
  questions?: string[]
}

interface DiffParts {
  names: string
  patch: string
  falhou?: string
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

export function extractVerdictJson(text: string): RawVerdict | null {
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

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function timeoutForDiff(diff: DiffParts): number {
  const kb = diff.patch.length / 1024
  return Math.round(clamp(GATE_TIMEOUT_MIN_MS + kb * GATE_TIMEOUT_MS_PER_KB, GATE_TIMEOUT_MIN_MS, GATE_TIMEOUT_MAX_MS))
}

async function accumulatedDiff(wt: string, base: string, working: boolean): Promise<DiffParts> {
  if (working) {
    const st = await stageAll(wt)
    if (st.err) return { names: '', patch: '', falhou: `git add falhou: ${primeiraLinha(st.stderr)}` }
  }
  const range = working ? ['--cached', '--merge-base', `origin/${base}`] : [`origin/${base}...HEAD`]
  const nomes = await runGit(wt, ['diff', '--name-status', ...range])
  if (nomes.err) return { names: '', patch: '', falhou: `git diff --name-status falhou: ${primeiraLinha(nomes.stderr)}` }
  const namesRaw = nomes.stdout.trim()
  const names = namesRaw.length > 4000 ? namesRaw.slice(0, 4000) + '\n[...lista truncada...]' : namesRaw
  const corpo = await runGit(wt, ['diff', ...range])
  if (corpo.err) return { names: '', patch: '', falhou: `git diff falhou: ${primeiraLinha(corpo.stderr)}` }
  const raw = corpo.stdout
  const patch = raw.length > GATE_DIFF_LIMIT ? raw.slice(0, GATE_DIFF_LIMIT) + '\n[...diff truncado...]' : raw
  return { names, patch }
}

function primeiraLinha(texto: string): string {
  return String(texto || '').split('\n').filter(Boolean)[0]?.slice(0, 160) ?? 'sem detalhe'
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

function buildParsed(text: string, cost: number, tokens: number): ParsedGate {
  const v = extractVerdictJson(text)
  if (v) {
    const questions = Array.isArray(v.questions)
      ? v.questions.map(q => oneLine(String(q)).slice(0, 240)).filter(Boolean).slice(0, 3)
      : []
    return { found: true, verdict: normalizeVerdict(String(v.verdict || 'CONDITIONAL')), reason: oneLine(String(v.reason || '')).slice(0, 240), questions, cost, tokens }
  }
  return { found: false, verdict: 'CONDITIONAL', reason: '', questions: [], cost, tokens }
}

async function gateReview(wt: string, base: string, desc: string, working: boolean, id: string): Promise<GateResult> {
  const diff = await accumulatedDiff(wt, base, working)
  if (diff.falhou) {
    return { ok: false, verdict: 'BLOCKED', reason: `nao consegui LER o diff para revisar — ${diff.falhou}`, questions: [], cost: 0, costMeasured: true, tokens: 0 }
  }
  if (!diff.names.trim()) {
    return { ok: true, verdict: 'APPROVED', reason: 'sem mudancas vs a base', questions: [], cost: 0, costMeasured: true, tokens: 0 }
  }
  const provider = providerFor('gate')
  const res = await runProvider(id, provider, {
    prompt: buildPrompt(desc, diff),
    cwd: ROOT,
    dirs: [wt],
    mode: 'readonly',
    useAgents: false,
    model: modelFor('gate'),
    effort: effortFor('gate'),
    timeoutMs: timeoutForDiff(diff),
  })
  const tokens = sumTokens(res.usage)
  if (res.failed) {
    const cls = classifyFailure(provider.name, { timedOut: res.timedOut, detail: res.detail, text: res.text })
    return { ok: false, verdict: 'CONDITIONAL', reason: `gate NAO executou (${res.timedOut ? 'timeout' : 'erro'}): ${oneLine(res.detail).slice(0, 120)}`, questions: [], cost: res.cost, costMeasured: res.costMeasured, tokens, failureClass: cls.failureClass, failureReason: cls.reason, provider: provider.name }
  }
  const parsed = buildParsed(res.text, res.cost, tokens)
  if (!parsed.found) {
    return { ok: false, verdict: 'CONDITIONAL', reason: 'gate sem veredito parseavel na saida (revisar manualmente)', questions: [], cost: res.cost, costMeasured: res.costMeasured, tokens }
  }
  return { ok: true, verdict: parsed.verdict, reason: parsed.reason, questions: parsed.questions, cost: res.cost, costMeasured: res.costMeasured, tokens }
}

export type GateOutcome = 'halt' | 'proceed'

export function gateOutcome(gate: GateResult): GateOutcome {
  if (!gate.ok) return 'halt'
  return gate.verdict === 'BLOCKED' ? 'halt' : 'proceed'
}

export function gateHaltReason(gate: GateResult): string {
  return gate.ok
    ? `codefox gate BLOCKED: ${gate.reason}`
    : `codefox gate NAO concluiu (nao ha veredito confiavel): ${gate.reason}`
}

export function runCodefoxGate(wt: string, base: string, desc: string, id = ''): Promise<GateResult> {
  return gateReview(wt, base, desc, false, id)
}

export function runGatedReview(wt: string, base: string, desc: string, id = ''): Promise<GateResult> {
  return gateReview(wt, base, desc, true, id)
}

export async function withGateRetry(run: () => Promise<GateResult>, onRetry?: (reason: string) => void): Promise<GateResult> {
  let g = await run()
  for (let retry = 0; !g.ok && retry < GATE_RETRIES; retry++) {
    onRetry?.(g.reason)
    const again = await run()
    g = { ...again, cost: g.cost + again.cost, costMeasured: g.costMeasured && again.costMeasured, tokens: g.tokens + again.tokens }
  }
  return g
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
