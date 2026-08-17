import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { extractObjetivo } from '../card'
import type { Card, FailureClass, ImplementResult, VerifyResult } from '../card'
import { cardsDir, ROOT, RUN_TIMEOUT_MS, PROJECT_MEMORY } from './config'
import { isProviderName, modelFor, providerFor, effortFor } from '../ai/registry'
import { sumTokens } from '../ai/usage'
import { classifyFailure } from '../ai/failure'
import type { AiProvider } from '../ai/types'
import { readProjectRules } from './hicode-home'
import { repoPath } from './card-store'
import { runProvider } from './cost-trust'
import { markProviderSubstituted } from './provider-trust'
import { readProjectMemory } from './memory'
import { readContract } from '../contract/store'
import { DESIGN_SYSTEM_BRIEF } from './design'
import { clarifyAnswersPrompt } from './clarify'
import { refPaths, resolveRefs } from './refs'
import { markRefsRefused } from './ref-trust'

export interface StepResult {
  time: number
  cost: number
  costMeasured: boolean
  tokens: number
  text: string
  ok: boolean
  failureClass?: FailureClass
  failureReason?: string
  provider?: string
}

function firstLine(s: string, max: number): string {
  return String(s || '').split('\n')[0]?.slice(0, max) ?? ''
}

function stackOf(repo: string): string {
  const c = repo ? readContract(repo) : null
  return c?.stack ?? 'stack nao detectado — inspecione o projeto antes de editar'
}

function implementPrompt(provider: AiProvider, workdir: string, desc: string, feedback: string, rules: string, visual: boolean, clarifications: string, refImages: string[], memory: string, stack: string): string {
  const refs = refImages.length
    ? `REFERENCIAS DE DESIGN (${refImages.length}): abra CADA imagem abaixo com a tool Read e replique o design o mais FIEL possivel (layout, cores, tipografia, espacamento, componentes); extraia os tokens a partir delas. Imagens:\n${refImages.map(p => `- ${p}`).join('\n')}\n`
    : ''
  const head = provider.supportsAgents
    ? [
        'Use os AGENTES NEXUS deste projeto para implementar a tarefa abaixo (auto-construcao do hicode).',
        `O codigo a alterar fica em: ${workdir} — ${stack}. Edite os arquivos DESSE diretorio.`,
        'Roteie via Task: frontend/Vue/UI -> vitro (estrutura/design-system -> frontiteto); logica/feature -> limpio; banco -> radix; refactor -> rufus. NAO rode crivo/review nesta etapa (nao chame o crivo): a revisao adversarial e os gates rodam DEPOIS, na fase de polimento do motor. Apenas implemente.',
      ]
    : [
        'Implemente a tarefa abaixo (auto-construcao do hicode).',
        `O codigo a alterar fica em: ${workdir} — ${stack}. Edite os arquivos DESSE diretorio.`,
      ]
  return [
    rules ? `CONTEXTO DO PROJETO (.hii/rules.md — respeite):\n${rules}\n` : '',
    memory ? `MEMORIA DO PROJETO (.hii/memory — decisoes/convencoes acumuladas, respeite):\n${memory}\n` : '',
    clarifications ? clarifications : '',
    refs,
    visual ? `${DESIGN_SYSTEM_BRIEF}\n` : '',
    ...head,
    'Faca a MENOR mudanca que cumpra a tarefa. NAO rode git, NAO faca commit, NAO inicie servidores. Sem comentarios de prosa.',
    feedback ? `\nATENCAO (reexecucao): ${feedback}` : '',
    '',
    'TAREFA:',
    desc ?? '',
    '',
    'Ao terminar, responda em 1 linha: qual agente atuou e o que mudou.',
  ].join('\n')
}

export async function implement(card: Card, workdir: string, feedback = '', visual = false): Promise<ImplementResult> {
  const desc = extractObjetivo(card.body) || card.fm.title || ''
  const id = card.fm.id ?? ''
  const override = card.fm.provider_override_implement || undefined
  const provider = providerFor('implement', override)
  const model = modelFor('implement', override)
  if (override && !isProviderName(override)) markProviderSubstituted(id, override, provider.name)
  if (!provider.agentic) return { ok: false, reason: `provider ${provider.name} nao edita arquivos (nao-agentico) — use claude/codex para implementar`, cost: '', costMeasured: true, provider: provider.name, model, failureClass: 'terminal', failureReason: 'provider configurado nao edita arquivos' }
  const refOutcomes = provider.supportsVision ? await resolveRefs(id) : []
  markRefsRefused(id, refOutcomes)
  const refImages = refPaths(refOutcomes)
  const dirs = refImages.length ? [workdir, join(cardsDir(), 'refs', id)] : [workdir]
  const target = repoPath(card.fm.repo ?? '')
  const memory = PROJECT_MEMORY ? readProjectMemory(target) : ''
  const res = await runProvider(id, provider, {
    prompt: implementPrompt(provider, workdir, desc, feedback, readProjectRules(workdir), visual, clarifyAnswersPrompt(id), refImages, memory, stackOf(target)),
    cwd: ROOT,
    dirs,
    mode: 'edit',
    useAgents: provider.supportsAgents,
    model,
    effort: effortFor('implement', card.fm.effort),
    timeoutMs: RUN_TIMEOUT_MS,
    liveLog: id ? join(cardsDir(), 'runs', `${id}.live.log`) : undefined,
  })
  const cost = res.cost ? res.cost.toFixed(4) : ''
  if (!res.ok) {
    const reason = res.isError
      ? `${provider.name} is_error: ${firstLine(res.text, 140)}`
      : `${provider.name} ${res.timedOut ? 'timeout' : 'falhou: ' + res.detail}`
    const cls = classifyFailure(provider.name, { timedOut: res.timedOut, detail: res.detail, text: res.text })
    return { ok: false, reason, cost, costMeasured: res.costMeasured, usage: res.usage, timedOut: res.timedOut, failureClass: cls.failureClass, failureReason: cls.reason, provider: provider.name, model }
  }
  return { ok: true, resultText: firstLine(res.text, 140), fullText: String(res.text || '').slice(0, 8000), cost, costMeasured: res.costMeasured, usage: res.usage, provider: provider.name, model }
}

export async function verifyVisual(card: Card, shotPath: string): Promise<VerifyResult> {
  if (!existsSync(shotPath)) return { ok: false, conclusive: false, reason: 'sem screenshot — preview nao renderizou (inconclusivo)', cost: 0, tokens: 0 }
  const provider = providerFor('verify')
  if (!provider.supportsVision) return { ok: false, conclusive: false, reason: `provider ${provider.name} nao le imagem — verify visual inconclusivo`, cost: 0, tokens: 0 }
  const desc = extractObjetivo(card.body) || card.fm.title
  const prompt = [
    'Voce e um verificador VISUAL. Use a tool Read para abrir a imagem (screenshot da pagina web renderizada) no caminho abaixo e analise o que aparece.',
    `Imagem: ${shotPath}`,
    `Tarefa que deveria ter sido aplicada: "${desc}"`,
    'A mudanca/elemento pedido aparece DE FATO e visivelmente na pagina? Seja rigoroso. Responda APENAS um JSON em uma linha, sem texto extra: {"ok": true ou false, "reason": "motivo curto"}.',
  ].join('\n')
  const res = await runProvider(card.fm.id ?? '', provider, {
    prompt,
    cwd: ROOT,
    dirs: [dirname(shotPath)],
    mode: 'readonly',
    useAgents: false,
    model: modelFor('verify'),
    effort: effortFor('verify', card.fm.effort),
    timeoutMs: 120000,
  })
  const tokens = sumTokens(res.usage)
  const inner = res.text.match(/\{[\s\S]*?\}/)
  if (inner && inner[0]) {
    try {
      const v = JSON.parse(inner[0]) as { ok?: boolean; reason?: string }
      return { ok: !!v.ok, conclusive: true, reason: String(v.reason || '').slice(0, 140), cost: res.cost, tokens }
    } catch { void 0 }
  }
  return { ok: false, conclusive: false, reason: 'verify inconclusivo (sem veredito parseavel)', cost: res.cost, tokens }
}

function stepPrompt(provider: AiProvider, wt: string, agent: string, instruction: string, rules: string, stack: string): string {
  const head = provider.supportsAgents
    ? `Use o agente Nexus ${agent} no projeto em ${wt} — ${stack}. Edite arquivos apenas se necessario.`
    : `Atue no papel "${agent}" no projeto em ${wt} — ${stack}. Edite arquivos apenas se necessario.`
  return [
    rules ? `CONTEXTO DO PROJETO (.hii/rules.md — respeite):\n${rules}\n` : '',
    head,
    'NAO rode git/commit, NAO inicie servidores. Sem comentarios de prosa no codigo. Se nao houver nada a fazer, responda "nada a fazer".',
    instruction,
    'Responda em 1 linha o que foi feito.',
  ].join('\n')
}

export async function runStep(wt: string, agent: string, instruction: string, id = '', repo = ''): Promise<StepResult> {
  const t = Date.now()
  const provider = providerFor('step')
  if (!provider.agentic) return { time: 0, cost: 0, costMeasured: true, tokens: 0, ok: false, text: `provider ${provider.name} nao-agentico — step "${agent}" NAO executou (use claude/codex para steps que editam)`, failureClass: 'terminal', failureReason: 'provider configurado nao edita arquivos', provider: provider.name }
  const res = await runProvider(id, provider, {
    prompt: stepPrompt(provider, wt, agent, instruction, readProjectRules(wt), stackOf(repo || wt)),
    cwd: ROOT,
    dirs: [wt],
    mode: 'edit',
    useAgents: provider.supportsAgents,
    model: modelFor('step'),
    effort: effortFor('step'),
    timeoutMs: RUN_TIMEOUT_MS,
    liveLog: id ? join(cardsDir(), 'runs', `${id}.live.log`) : undefined,
  })
  const time = Math.round((Date.now() - t) / 1000)
  const tokens = sumTokens(res.usage)
  if (!res.ok) {
    const cls = classifyFailure(provider.name, { timedOut: res.timedOut, detail: res.detail, text: res.text })
    return { time, cost: res.cost, costMeasured: res.costMeasured, tokens, text: firstLine(res.text, 120) || res.detail, ok: false, failureClass: cls.failureClass, failureReason: cls.reason, provider: provider.name }
  }
  return { time, cost: res.cost, costMeasured: res.costMeasured, tokens, text: firstLine(res.text, 120), ok: true, provider: provider.name }
}
