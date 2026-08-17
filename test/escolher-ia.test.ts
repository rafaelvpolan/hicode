import { test, expect, beforeEach } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hicode-ia-'))
  process.env.HICODE_IA_FILE = join(dir, 'ia.json')
  for (const v of ['HICODE_EFFORT', 'HICODE_IMPLEMENT_PROVIDER', 'HICODE_GATE_PROVIDER', 'HICODE_AI_PROVIDER']) {
    delete process.env[v]
  }
})

test('tab cicla o provedor de implement e persiste', async () => {
  const { ciclarIa } = await import('../lib/core/escolher-ia')
  const { providerNameFor } = await import('../lib/ai/registry')
  const primeiro = providerNameFor('implement')
  ciclarIa('implement', 1)
  const depois = providerNameFor('implement')
  expect(depois).not.toBe(primeiro)
})

test('ciclar da a volta e nao sai da lista de provedores', async () => {
  const { ciclarIa } = await import('../lib/core/escolher-ia')
  const { providerNames, providerNameFor } = await import('../lib/ai/registry')
  const nomes = providerNames()
  for (let i = 0; i < nomes.length + 2; i++) {
    ciclarIa('implement', 1)
    expect(nomes).toContain(providerNameFor('implement'))
  }
})

test('shift+tab volta para o provedor anterior', async () => {
  const { ciclarIa } = await import('../lib/core/escolher-ia')
  const { providerNameFor } = await import('../lib/ai/registry')
  ciclarIa('implement', 1)
  const meio = providerNameFor('implement')
  ciclarIa('implement', 1)
  ciclarIa('implement', -1)
  expect(providerNameFor('implement')).toBe(meio)
})

test('ciclar implement NAO mexe no gate', async () => {
  const { ciclarIa } = await import('../lib/core/escolher-ia')
  const { providerNameFor } = await import('../lib/ai/registry')
  const gateAntes = providerNameFor('gate')
  ciclarIa('implement', 1)
  expect(providerNameFor('gate')).toBe(gateAntes)
})

test('a troca vale sem reiniciar: a leitura seguinte ja ve o novo valor', async () => {
  const { aplicar } = await import('../lib/core/escolher-ia')
  const { providerNameFor, modelFor } = await import('../lib/ai/registry')
  aplicar({ papeis: ['gate'], provider: 'codex', model: 'gpt-5.5' })
  expect(providerNameFor('gate')).toBe('codex')
  expect(modelFor('gate')).toBe('gpt-5.5')
})

test('preferencia em arquivo vence a env', async () => {
  process.env.HICODE_GATE_PROVIDER = 'ollama'
  const { aplicar } = await import('../lib/core/escolher-ia')
  const { providerNameFor } = await import('../lib/ai/registry')
  aplicar({ papeis: ['gate'], provider: 'codex' })
  expect(providerNameFor('gate')).toBe('codex')
  delete process.env.HICODE_GATE_PROVIDER
})

test('padrao limpa a preferencia e a env volta a valer', async () => {
  process.env.HICODE_GATE_PROVIDER = 'ollama'
  const { aplicar, limpar } = await import('../lib/core/escolher-ia')
  const { providerNameFor } = await import('../lib/ai/registry')
  aplicar({ papeis: ['gate'], provider: 'codex' })
  limpar(['gate'])
  expect(providerNameFor('gate')).toBe('ollama')
  delete process.env.HICODE_GATE_PROVIDER
})

test('interpretar entende papel, provedor, modelo e esforco em qualquer ordem', async () => {
  const { interpretar } = await import('../lib/core/escolher-ia')
  expect(interpretar(['gate', 'claude', 'opus']).ajuste).toMatchObject({ papeis: ['gate'], provider: 'claude', model: 'opus' })
  expect(interpretar(['high', 'codex']).ajuste).toMatchObject({ provider: 'codex', effort: 'high' })
  expect(interpretar(['modelo=gpt-5.5']).ajuste).toMatchObject({ model: 'gpt-5.5' })
})

test('sem papel, o ajuste vale para todos', async () => {
  const { interpretar } = await import('../lib/core/escolher-ia')
  const { agentRoles } = await import('../lib/ai/registry')
  expect(interpretar(['claude']).ajuste?.papeis).toEqual(agentRoles())
})

test('argumento vazio ou sem sentido nao muda nada em silencio', async () => {
  const { interpretar } = await import('../lib/core/escolher-ia')
  expect(interpretar([]).ajuste).toBeUndefined()
  expect(interpretar(['gate']).erro).toBeTruthy()
})

test('esforco escolhido chega ao pedido do provedor', async () => {
  const { aplicar } = await import('../lib/core/escolher-ia')
  const { effortFor } = await import('../lib/ai/registry')
  aplicar({ papeis: ['implement'], effort: 'xhigh' })
  expect(effortFor('implement')).toBe('xhigh')
})

test('esforco do card vence a preferencia global', async () => {
  const { aplicar } = await import('../lib/core/escolher-ia')
  const { effortFor } = await import('../lib/ai/registry')
  aplicar({ papeis: ['implement'], effort: 'low' })
  expect(effortFor('implement', 'max')).toBe('max')
})

test('esforco invalido e ignorado em vez de virar argumento de CLI', async () => {
  const { effortFor } = await import('../lib/ai/registry')
  expect(effortFor('implement', 'altissimo')).toBeUndefined()
})

test('REGRESSAO esforco vira argumento real do CLI, nao so enfeite no rodape', async () => {
  const claude = await Bun.file('lib/ai/adapters/claude.ts').text()
  expect(claude).toContain("a.push('--effort', req.effort)")
  const codex = await Bun.file('lib/ai/adapters/codex.ts').text()
  expect(codex).toContain('model_reasoning_effort')
})

test('o pedido do provedor carrega o campo de esforco', async () => {
  const tipos = await Bun.file('lib/ai/types.ts').text()
  expect(tipos).toContain('effort?: string')
})

test('os ajustes cobrem ia e esforco de cada papel', async () => {
  const { itensDeAjuste } = await import('../lib/core/ajustes')
  const { agentRoles } = await import('../lib/ai/registry')
  const itens = itensDeAjuste()
  expect(itens.length).toBe(agentRoles().length * 2)
  expect(itens.filter(i => i.tipo === 'ia').length).toBe(agentRoles().length)
  expect(itens.every(i => i.opcoes.length > 0)).toBe(true)
})

test('tab no ajuste selecionado troca so aquele campo', async () => {
  const { itensDeAjuste, ciclarAjuste } = await import('../lib/core/ajustes')
  const { providerNameFor, effortFor } = await import('../lib/ai/registry')
  const gateAntes = providerNameFor('gate')
  const implAntes = providerNameFor('implement')
  ciclarAjuste('implement:ia', 1)
  expect(providerNameFor('implement')).not.toBe(implAntes)
  expect(providerNameFor('gate')).toBe(gateAntes)
  ciclarAjuste('implement:esforco', 1)
  expect(effortFor('implement')).toBeTruthy()
  expect(itensDeAjuste().find(i => i.chave === 'implement:esforco')?.valor).toBe(effortFor('implement'))
})

test('ciclar esforco nao mexe no provedor, e vice-versa', async () => {
  const { ciclarAjuste } = await import('../lib/core/ajustes')
  const { providerNameFor, effortFor } = await import('../lib/ai/registry')
  ciclarAjuste('gate:ia', 1)
  const ia = providerNameFor('gate')
  ciclarAjuste('gate:esforco', 1)
  expect(providerNameFor('gate')).toBe(ia)
  const esforco = effortFor('gate')
  ciclarAjuste('gate:ia', 1)
  expect(effortFor('gate')).toBe(esforco)
})

test('chave desconhecida nao muda nada e avisa', async () => {
  const { ciclarAjuste } = await import('../lib/core/ajustes')
  const r = ciclarAjuste('nao:existe', 1)
  expect(r.ok).toBe(false)
  expect(r.mensagem).toContain('nada selecionado')
})

test('o rodape marca o ajuste selecionado sem desalinhar', async () => {
  const { linhasAjustes } = await import('../lib/core/render/rodape')
  const itens = [
    { chave: 'a', rotulo: 'executa · ia', valor: 'claude' },
    { chave: 'b', rotulo: 'revisa · ia', valor: 'codex' },
  ]
  const linhas = linhasAjustes(itens, { selecionado: 'b', width: 78 })
  expect(linhas[0]).toContain('shift+tab sai')
  expect(linhas[1]?.startsWith('▌')).toBe(false)
  expect(linhas[2]?.startsWith('▌')).toBe(true)
  expect(linhas[1]?.indexOf('claude')).toBe(linhas[2]?.indexOf('codex'))
})
