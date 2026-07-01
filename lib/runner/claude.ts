import { dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { extractObjetivo } from '../card'
import type { Card, ImplementResult, VerifyResult, Usage } from '../card'
import { ROOT, RUN_TIMEOUT_MS, VERIFY_MODEL } from './config'
import { run } from './git'

interface ClaudeJsonResult {
  total_cost_usd?: number
  result?: string
  is_error?: boolean
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

export interface StepResult {
  time: number
  cost: number
  tokens: number
  text: string
}

export async function implement(card: Card, workdir: string, feedback = ''): Promise<ImplementResult> {
  const desc = extractObjetivo(card.body) || card.fm.title
  const prompt = [
    'Use os AGENTES NEXUS deste projeto para implementar a tarefa abaixo (auto-construcao do hicode).',
    `O codigo a alterar fica em: ${workdir} (Vite + Vue 3 + TypeScript). Edite os arquivos em src/ DESSE diretorio.`,
    'Roteie via Task: frontend/Vue/UI -> vitro; logica/feature -> limpio; banco -> radix; refactor -> rufus. Apos agente gated, passe pelo crivo.',
    'Faca a MENOR mudanca que cumpra a tarefa. NAO rode git, NAO faca commit, NAO inicie servidores. Sem comentarios de prosa.',
    feedback ? `\nATENCAO (reexecucao): ${feedback}` : '',
    '',
    'TAREFA:',
    desc ?? '',
    '',
    'Ao terminar, responda em 1 linha: qual agente atuou e o que mudou.',
  ].join('\n')
  const { err, stdout, stderr } = await run('claude', [
    '-p', prompt,
    '--output-format', 'json',
    '--permission-mode', 'acceptEdits',
    '--add-dir', workdir,
    '--allowedTools', 'Task,Read,Edit,Write,Glob,Grep,Bash',
  ], { cwd: ROOT, timeout: RUN_TIMEOUT_MS })
  let cost = ''
  let resultText = ''
  let isError = false
  let usage: Usage | undefined
  try {
    const j = JSON.parse(stdout) as ClaudeJsonResult
    cost = typeof j.total_cost_usd === 'number' ? j.total_cost_usd.toFixed(4) : ''
    resultText = String(j.result || '').split('\n')[0]?.slice(0, 140) ?? ''
    isError = !!j.is_error
    const u = j.usage || {}
    usage = {
      tokens_in: u.input_tokens || 0,
      tokens_out: u.output_tokens || 0,
      tokens_cache_create: u.cache_creation_input_tokens || 0,
      tokens_cache_read: u.cache_read_input_tokens || 0,
    }
  } catch {
    resultText = String(stdout || stderr || '').split('\n')[0]?.slice(0, 140) ?? ''
  }
  if (err) return { ok: false, reason: `claude ${err.killed ? 'timeout' : 'falhou: ' + err.message}`, cost, usage }
  if (isError) return { ok: false, reason: `claude is_error: ${resultText}`, cost, usage }
  return { ok: true, resultText, cost, usage }
}

export async function verifyVisual(card: Card, shotPath: string): Promise<VerifyResult> {
  if (!existsSync(shotPath)) return { ok: true, reason: 'sem screenshot', cost: 0, tokens: 0 }
  const desc = extractObjetivo(card.body) || card.fm.title
  const prompt = [
    'Voce e um verificador VISUAL. Use a tool Read para abrir a imagem (screenshot da pagina web renderizada) no caminho abaixo e analise o que aparece.',
    `Imagem: ${shotPath}`,
    `Tarefa que deveria ter sido aplicada: "${desc}"`,
    'A mudanca/elemento pedido aparece DE FATO e visivelmente na pagina? Seja rigoroso. Responda APENAS um JSON em uma linha, sem texto extra: {"ok": true ou false, "reason": "motivo curto"}.',
  ].join('\n')
  const { stdout } = await run('claude', [
    '-p', prompt, '--output-format', 'json', '--model', VERIFY_MODEL,
    '--add-dir', dirname(shotPath), '--allowedTools', 'Read,Glob',
  ], { cwd: ROOT, timeout: 120000 })
  let cost = 0
  let tokens = 0
  let ok = true
  let reason = 'verify inconclusivo'
  try {
    const j = JSON.parse(stdout) as ClaudeJsonResult
    cost = Number(j.total_cost_usd) || 0
    const u = j.usage || {}
    tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0)
    const inner = String(j.result || '').match(/\{[\s\S]*?\}/)
    if (inner && inner[0]) {
      const v = JSON.parse(inner[0]) as { ok?: boolean; reason?: string }
      ok = !!v.ok
      reason = String(v.reason || '').slice(0, 140)
    }
  } catch {
    ok = true
    reason = 'parse do verify falhou (assumindo ok)'
  }
  return { ok, reason, cost, tokens }
}

export async function runStep(wt: string, agent: string, instruction: string): Promise<StepResult> {
  const t = Date.now()
  const prompt = [
    `Use o agente Nexus ${agent} no projeto web em ${wt} (Vite + Vue 3 + TypeScript). Edite arquivos em src/ apenas se necessario.`,
    'NAO rode git/commit, NAO inicie servidores. Sem comentarios de prosa no codigo. Se nao houver nada a fazer, responda "nada a fazer".',
    instruction,
    'Responda em 1 linha o que foi feito.',
  ].join('\n')
  const { stdout } = await run('claude', [
    '-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits',
    '--add-dir', wt, '--allowedTools', 'Task,Read,Edit,Write,Glob,Grep,Bash',
  ], { cwd: ROOT, timeout: RUN_TIMEOUT_MS })
  let cost = 0
  let tokens = 0
  let text = ''
  try {
    const j = JSON.parse(stdout) as ClaudeJsonResult
    cost = Number(j.total_cost_usd) || 0
    const u = j.usage || {}
    tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0)
    text = String(j.result || '').split('\n')[0]?.slice(0, 120) ?? ''
  } catch {
    void 0
  }
  return { time: Math.round((Date.now() - t) / 1000), cost, tokens, text }
}
