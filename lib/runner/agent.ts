import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { extractObjetivo } from '../card'
import type { Card, ImplementResult, VerifyResult } from '../card'
import { CARDS_DIR, ROOT, RUN_TIMEOUT_MS, PROJECT_MEMORY } from './config'
import { modelFor, providerFor } from '../ai/registry'
import { sumTokens } from '../ai/usage'
import type { AiProvider } from '../ai/types'
import { readProjectRules } from './hicode-home'
import { repoPath } from './card-store'
import { readProjectMemory } from './memory'
import { DESIGN_SYSTEM_BRIEF } from './design'
import { clarifyAnswersPrompt } from './clarify'
import { resolveRefImages } from './refs'

export interface StepResult {
  time: number
  cost: number
  tokens: number
  text: string
  ok: boolean
}

function firstLine(s: string, max: number): string {
  return String(s || '').split('\n')[0]?.slice(0, max) ?? ''
}

function implementPrompt(provider: AiProvider, workdir: string, desc: string, feedback: string, rules: string, visual: boolean, clarifications: string, refImages: string[], memory: string): string {
  const refs = refImages.length
    ? `REFERENCIAS DE DESIGN (${refImages.length}): abra CADA imagem abaixo com a tool Read e replique o design o mais FIEL possivel (layout, cores, tipografia, espacamento, componentes); extraia os tokens a partir delas. Imagens:\n${refImages.map(p => `- ${p}`).join('\n')}\n`
    : ''
  const head = provider.supportsAgents
    ? [
        'Use os AGENTES NEXUS deste projeto para implementar a tarefa abaixo (auto-construcao do hicode).',
        `O codigo a alterar fica em: ${workdir} (Vite + Vue 3 + TypeScript). Edite os arquivos em src/ DESSE diretorio.`,
        'Roteie via Task: frontend/Vue/UI -> vitro (estrutura/design-system -> frontiteto); logica/feature -> limpio; banco -> radix; refactor -> rufus. NAO rode crivo/review nesta etapa (nao chame o crivo): a revisao adversarial e os gates rodam DEPOIS, na fase de polimento do motor. Apenas implemente.',
      ]
    : [
        'Implemente a tarefa abaixo (auto-construcao do hicode).',
        `O codigo a alterar fica em: ${workdir} (Vite + Vue 3 + TypeScript). Edite os arquivos em src/ DESSE diretorio.`,
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
  const provider = providerFor('implement')
  if (!provider.agentic) return { ok: false, reason: `provider ${provider.name} nao edita arquivos (nao-agentico) — use opencode/codex, ou opencode+ollama, para implementar`, cost: '' }
  const id = card.fm.id ?? ''
  const refImages = provider.supportsVision ? await resolveRefImages(id) : []
  const dirs = refImages.length ? [workdir, join(CARDS_DIR, 'refs', id)] : [workdir]
  const memory = PROJECT_MEMORY ? readProjectMemory(repoPath(card.fm.repo ?? '')) : ''
  const res = await provider.run({
    prompt: implementPrompt(provider, workdir, desc, feedback, readProjectRules(workdir), visual, clarifyAnswersPrompt(id), refImages, memory),
    cwd: ROOT,
    dirs,
    mode: 'edit',
    useAgents: provider.supportsAgents,
    model: modelFor('implement'),
    timeoutMs: RUN_TIMEOUT_MS,
    liveLog: id ? join(CARDS_DIR, 'runs', `${id}.live.log`) : undefined,
  })
  const cost = res.cost ? res.cost.toFixed(4) : ''
  if (!res.ok) {
    const reason = res.isError
      ? `${provider.name} is_error: ${firstLine(res.text, 140)}`
      : `${provider.name} ${res.timedOut ? 'timeout' : 'falhou: ' + res.detail}`
    return { ok: false, reason, cost, usage: res.usage, timedOut: res.timedOut }
  }
  return { ok: true, resultText: firstLine(res.text, 140), fullText: String(res.text || '').slice(0, 8000), cost, usage: res.usage }
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
  const res = await provider.run({
    prompt,
    cwd: ROOT,
    dirs: [dirname(shotPath)],
    mode: 'readonly',
    useAgents: false,
    model: modelFor('verify'),
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

function stepPrompt(provider: AiProvider, wt: string, agent: string, instruction: string, rules: string): string {
  const head = provider.supportsAgents
    ? `Use o agente Nexus ${agent} no projeto web em ${wt} (Vite + Vue 3 + TypeScript). Edite arquivos em src/ apenas se necessario.`
    : `Atue no papel "${agent}" no projeto web em ${wt} (Vite + Vue 3 + TypeScript). Edite arquivos em src/ apenas se necessario.`
  return [
    rules ? `CONTEXTO DO PROJETO (.hii/rules.md — respeite):\n${rules}\n` : '',
    head,
    'NAO rode git/commit, NAO inicie servidores. Sem comentarios de prosa no codigo. Se nao houver nada a fazer, responda "nada a fazer".',
    instruction,
    'Responda em 1 linha o que foi feito.',
  ].join('\n')
}

export async function runStep(wt: string, agent: string, instruction: string, id = ''): Promise<StepResult> {
  const t = Date.now()
  const provider = providerFor('step')
  if (!provider.agentic) return { time: 0, cost: 0, tokens: 0, ok: false, text: `provider ${provider.name} nao-agentico — step "${agent}" NAO executou (use codex/opencode para steps que editam)` }
  const res = await provider.run({
    prompt: stepPrompt(provider, wt, agent, instruction, readProjectRules(wt)),
    cwd: ROOT,
    dirs: [wt],
    mode: 'edit',
    useAgents: provider.supportsAgents,
    model: modelFor('step'),
    timeoutMs: RUN_TIMEOUT_MS,
    liveLog: id ? join(CARDS_DIR, 'runs', `${id}.live.log`) : undefined,
  })
  return { time: Math.round((Date.now() - t) / 1000), cost: res.cost, tokens: sumTokens(res.usage), text: firstLine(res.text, 120), ok: res.ok }
}
