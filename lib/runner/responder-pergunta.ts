import { existsSync } from 'node:fs'
import { providerFor, modelFor, effortFor } from '../ai/registry'
import { runProvider } from './cost-trust'
import { readProjectRules } from './hicode-home'
import { readContract } from '../contract/store'
import { ROOT } from './config'
import { snapshotDoAmbiente } from './ambiente'

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

export interface TrocaDeConversa {
  pergunta: string
  resposta: string
}

function historico(trocas: TrocaDeConversa[]): string {
  if (!trocas.length) return ''
  const ultimas = trocas.slice(-3)
  return [
    'CONVERSA ANTERIOR (a mensagem atual pode ser continuacao desta):',
    ...ultimas.map(t => `  humano: ${t.pergunta}\n  voce: ${t.resposta.replace(/\s+/g, ' ').slice(0, 300)}`),
  ].join('\n')
}

export async function responderPergunta(
  pergunta: string,
  alvo: string,
  trocas: TrocaDeConversa[] = [],
): Promise<RespostaDePergunta> {
  const provider = providerFor('verify')
  const prompt = [
    'Voce responde uma PERGUNTA do usuario. NAO altere nenhum arquivo.',
    'Voce le arquivos do projeto e recebe abaixo um retrato do AMBIENTE desta maquina.',
    'Pergunta sobre "tem X instalado" se responde pelo retrato do ambiente, nao pelo codigo do projeto.',
    'Se a resposta estiver no codigo, leia o necessario e cite arquivo e linha.',
    'Se a informacao nao estiver nem no ambiente nem no projeto, diga isso claramente em vez de supor.',
    'Responda em portugues, direto, no maximo 12 linhas. Sem preambulo.',
    '',
    snapshotDoAmbiente(pergunta),
    historico(trocas),
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
