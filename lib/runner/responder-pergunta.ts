import { existsSync } from 'node:fs'
import { providerFor, modelFor, effortFor } from '../ai/registry'
import { runProvider } from './cost-trust'
import { readProjectRules } from './hicode-home'
import { readContract } from '../contract/store'
import { ROOT } from './config'

export interface RespostaDePergunta {
  ok: boolean
  texto: string
  custo: number
  custoMedido: boolean
  provedor: string
}

function contexto(alvo: string): string {
  if (!alvo || !existsSync(alvo)) return ''
  const contrato = readContract(alvo)
  const stack = contrato ? `Stack detectada: ${JSON.stringify(contrato).slice(0, 400)}` : ''
  const regras = readProjectRules(alvo)
  return [stack, regras].filter(Boolean).join('\n')
}

export async function responderPergunta(pergunta: string, alvo: string): Promise<RespostaDePergunta> {
  const provider = providerFor('verify')
  const prompt = [
    'Voce responde uma PERGUNTA sobre um projeto de software. NAO altere nenhum arquivo.',
    'Se a resposta estiver no codigo, leia o necessario e responda com base no que leu, citando arquivo e linha.',
    'Se nao houver informacao suficiente no projeto, diga isso claramente em vez de supor.',
    'Responda em portugues, direto, no maximo 12 linhas. Sem preambulo.',
    contexto(alvo),
    '',
    `PERGUNTA: ${pergunta}`,
  ].filter(Boolean).join('\n')

  const res = await runProvider('', provider, {
    prompt,
    cwd: ROOT,
    dirs: existsSync(alvo) ? [alvo] : [],
    mode: 'readonly',
    useAgents: false,
    model: modelFor('verify'),
    effort: effortFor('verify'),
    timeoutMs: 120000,
  })

  return {
    ok: res.ok,
    texto: (res.text || res.detail || '').trim(),
    custo: res.cost || 0,
    custoMedido: res.costMeasured,
    provedor: provider.name,
  }
}

export async function classificarComIaLocal(prompt: string): Promise<string> {
  const nome = process.env.HICODE_CLASSIFY_PROVIDER
  const provider = nome === 'ollama' || nome === 'codex' || nome === 'claude'
    ? providerFor('verify', nome)
    : providerFor('verify')
  const res = await runProvider('', provider, {
    prompt,
    cwd: ROOT,
    dirs: [],
    mode: 'readonly',
    useAgents: false,
    model: process.env.HICODE_CLASSIFY_MODEL || undefined,
    timeoutMs: Number(process.env.HICODE_CLASSIFY_TIMEOUT_MS || 15000),
  })
  return res.text || ''
}
