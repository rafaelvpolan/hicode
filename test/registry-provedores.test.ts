import { test, expect } from 'bun:test'
import { modelFor, providerNameFor, providerNames } from '../lib/ai/registry'

function comEnv(vars: Record<string, string>, fn: () => void): void {
  const anterior = new Map<string, string | undefined>()
  for (const [k, v] of Object.entries(vars)) {
    anterior.set(k, process.env[k])
    process.env[k] = v
  }
  try {
    fn()
  } finally {
    for (const [k, v] of anterior) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

test('o registry expoe exatamente os provedores do motor — opencode saiu', () => {
  expect(providerNames()).toEqual(['claude', 'codex', 'ollama'])
})

test('"opencode" nao e mais nome de provedor valido — override cai no default', () => {
  comEnv({ HICODE_AI_PROVIDER: 'claude' }, () => {
    expect(providerNameFor('implement', 'opencode')).toBe('claude')
  })
})

test('HICODE_OPENCODE_MODEL nao decide mais modelo nenhum', () => {
  comEnv({ HICODE_AI_PROVIDER: 'claude', HICODE_OPENCODE_MODEL: 'ollama/qwen' }, () => {
    expect(modelFor('implement', 'opencode')).toBeUndefined()
  })
})

test('modelFor segue exaustivo: cada provedor le a propria env de modelo', () => {
  comEnv({ HICODE_CODEX_MODEL: 'gpt-x', HICODE_OLLAMA_MODEL: 'qwen' }, () => {
    expect(modelFor('step', 'codex')).toBe('gpt-x')
    expect(modelFor('step', 'ollama')).toBe('qwen')
  })
})

test('modelFor do claude continua respondendo por papel', () => {
  comEnv({ HICODE_OPENCODE_MODEL: 'ollama/qwen' }, () => {
    expect(modelFor('verify', 'claude')).toBe('sonnet')
    expect(modelFor('gate', 'claude')).toBe('sonnet')
    expect(modelFor('implement', 'claude')).toBeUndefined()
  })
})
