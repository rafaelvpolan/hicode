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

test('/ia lista os provedores com a situacao real de cada um', async () => {
  const { provedoresDisponiveis } = await import('../lib/ai/disponibilidade')
  const { providerNames } = await import('../lib/ai/registry')
  const lista = provedoresDisponiveis()
  expect(lista.map(p => p.nome).sort()).toEqual([...providerNames()].sort())
  expect(lista.every(p => ['disponivel', 'ausente', 'precisa-servidor'].includes(p.situacao))).toBe(true)
})

test('provedor de CLI ausente nao e apresentado como disponivel', async () => {
  const { provedoresDisponiveis } = await import('../lib/ai/disponibilidade')
  const guardado = process.env.PATH
  process.env.PATH = '/caminho/que/nao/existe'
  const lista = provedoresDisponiveis()
  expect(lista.find(p => p.nome === 'claude')?.situacao).toBe('ausente')
  expect(lista.find(p => p.nome === 'claude')?.comoObter).toContain('CLI')
  process.env.PATH = guardado
})

test('provedor que depende de servidor nao mente que esta pronto', async () => {
  const { habilitadoDe } = await import('../lib/core/config-snapshot')
  const { definirEstadoDoOllama } = await import('../lib/ai/ollama-estado')
  const instalado = { nome: 'ollama' as const, situacao: 'disponivel' as const, instalado: true, comoObter: '', modelo: '', papeis: [] }
  definirEstadoDoOllama({ habilitado: false, modelos: [], verificadoEm: Date.now() })
  expect(habilitadoDe('ollama', instalado)).toBe(false)
  definirEstadoDoOllama({ habilitado: true, modelos: ['qwen3:1.7b'], verificadoEm: Date.now() })
  expect(habilitadoDe('ollama', instalado)).toBe(true)
})

test('binario ausente nunca conta como habilitado, mesmo com servidor no ar', async () => {
  const { habilitadoDe } = await import('../lib/core/config-snapshot')
  const { definirEstadoDoOllama } = await import('../lib/ai/ollama-estado')
  definirEstadoDoOllama({ habilitado: true, modelos: ['x'], verificadoEm: Date.now() })
  const ausente = { nome: 'ollama' as const, situacao: 'ausente' as const, instalado: false, comoObter: '', modelo: '', papeis: [] }
  expect(habilitadoDe('ollama', ausente)).toBe(false)
  expect(habilitadoDe('ollama', undefined)).toBe(false)
})

test('/ia mostra quais papeis usam cada provedor', async () => {
  const { aplicar } = await import('../lib/core/escolher-ia')
  const { provedoresDisponiveis } = await import('../lib/ai/disponibilidade')
  aplicar({ papeis: ['gate'], provider: 'codex' })
  const codex = provedoresDisponiveis().find(p => p.nome === 'codex')
  expect(codex?.papeis).toContain('gate')
})

test('a listagem do /ia nao esconde provedor sem papel', async () => {
  const { estadoDaIa } = await import('../lib/core/escolher-ia')
  const { providerNames } = await import('../lib/ai/registry')
  const texto = estadoDaIa().join('\n')
  for (const n of providerNames()) expect(texto, n).toContain(n)
})

test('REGRESSAO o rodape nao pode inventar "medium" quando nada esta configurado', async () => {
  const { effortFor } = await import('../lib/ai/registry')
  expect(effortFor('implement')).toBeUndefined()
})

test('o rodape reflete o esforco escolhido, e volta ao padrao quando limpo', async () => {
  const { aplicar, limpar } = await import('../lib/core/escolher-ia')
  const { effortFor } = await import('../lib/ai/registry')
  aplicar({ papeis: ['implement'], effort: 'xhigh' })
  expect(effortFor('implement')).toBe('xhigh')
  limpar(['implement'])
  expect(effortFor('implement')).toBeUndefined()
})

test('o esforco do card aparece no rodape quando a tarefa esta aberta', async () => {
  const { effortFor } = await import('../lib/ai/registry')
  expect(effortFor('implement', 'max')).toBe('max')
})

test('a env continua valendo como configuracao inicial no rodape', async () => {
  const { effortFor } = await import('../lib/ai/registry')
  process.env.HICODE_EFFORT = 'low'
  expect(effortFor('implement')).toBe('low')
  delete process.env.HICODE_EFFORT
})

test('REGRESSAO rodape e motor leem a MESMA fonte de esforco', async () => {
  const { esforcoAtual } = await import('../bin/lib/rodape-tui')
  const { effortFor } = await import('../lib/ai/registry')
  const { newSession } = await import('../lib/core/session')
  expect(esforcoAtual(newSession('org/app'))).toBe(effortFor('implement') ?? '(padrao do CLI)')
})

test('REGRESSAO o rodape nao pode chutar um esforco fixo', async () => {
  const fonte = await Bun.file('bin/lib/rodape-tui.ts').text()
  expect(fonte).toContain("effortFor('implement', doCard)")
  expect(fonte).not.toContain("|| 'medium'")
})

test('/model sem argumento lista os modelos da ia atual', async () => {
  const { definirModelo } = await import('../lib/core/escolher-ia')
  const r = definirModelo([])
  expect(r.ok).toBe(false)
  expect(r.mensagem).toContain('opus')
})

test('/model define o modelo do papel atual', async () => {
  const { definirModelo } = await import('../lib/core/escolher-ia')
  const { modelFor } = await import('../lib/ai/registry')
  definirModelo(['opus'])
  expect(modelFor('implement')).toBe('opus')
})

test('/model <papel> <modelo> mira o papel pedido', async () => {
  const { definirModelo } = await import('../lib/core/escolher-ia')
  const { modelFor } = await import('../lib/ai/registry')
  definirModelo(['gate', 'sonnet'])
  expect(modelFor('gate')).toBe('sonnet')
  expect(modelFor('implement')).not.toBe('sonnet')
})

test('/model fora do catalogo funciona, mas avisa', async () => {
  const { definirModelo } = await import('../lib/core/escolher-ia')
  const { modelFor } = await import('../lib/ai/registry')
  const r = definirModelo(['modelo-que-eu-inventei'])
  expect(r.ok).toBe(true)
  expect(r.mensagem).toContain('fora do catalogo')
  expect(modelFor('implement')).toBe('modelo-que-eu-inventei')
})

test('/model padrao devolve o modelo do CLI', async () => {
  const { definirModelo } = await import('../lib/core/escolher-ia')
  const { modelFor } = await import('../lib/ai/registry')
  definirModelo(['opus'])
  definirModelo(['padrao'])
  expect(modelFor('implement')).toBeUndefined()
})

test('/effort sem argumento lista os niveis', async () => {
  const { definirEsforco } = await import('../lib/core/escolher-ia')
  const r = definirEsforco([])
  expect(r.ok).toBe(false)
  expect(r.mensagem).toContain('xhigh')
})

test('/effort recusa nivel invalido em vez de mandar lixo para o CLI', async () => {
  const { definirEsforco } = await import('../lib/core/escolher-ia')
  const { effortFor } = await import('../lib/ai/registry')
  const r = definirEsforco(['altissimo'])
  expect(r.ok).toBe(false)
  expect(effortFor('implement')).toBeUndefined()
})

test('/effort padrao limpa so o esforco, preservando a ia escolhida', async () => {
  const { definirEsforco, aplicar } = await import('../lib/core/escolher-ia')
  const { effortFor, providerNameFor } = await import('../lib/ai/registry')
  aplicar({ papeis: ['implement'], provider: 'codex' })
  definirEsforco(['high'])
  definirEsforco(['padrao'])
  expect(effortFor('implement')).toBeUndefined()
  expect(providerNameFor('implement')).toBe('codex')
})

test('o catalogo de modelos vem de arquivo quando existe', async () => {
  const { modelosDe, origemDoCatalogo } = await import('../lib/ai/catalogo')
  expect(origemDoCatalogo('claude')).toBe('semente')
  expect(modelosDe('claude')).toContain('opus')
})

test('modelo em uso entra no catalogo mesmo sem estar na semente', async () => {
  const { definirModelo } = await import('../lib/core/escolher-ia')
  const { modelosDe } = await import('../lib/ai/catalogo')
  definirModelo(['implement', 'meu-modelo-local'])
  expect(modelosDe('claude')).toContain('meu-modelo-local')
})

test('autocompletar de /ia, /model e /effort oferece as opcoes certas', async () => {
  const { complete } = await import('../lib/core/complete')
  const { providerNames, agentRoles } = await import('../lib/ai/registry')
  const { modelosDe } = await import('../lib/ai/catalogo')
  const { ESFORCOS } = await import('../lib/ai/preferencias')
  const ctx = {
    repos: [], cards: [], statuses: [],
    provedores: providerNames(), modelos: modelosDe('claude'),
    esforcos: [...ESFORCOS], papeis: agentRoles(),
  }
  expect(complete('/ia ', ctx)[0]).toContain('claude')
  expect(complete('/model ', ctx)[0]).toContain('opus')
  expect(complete('/effort ', ctx)[0]).toContain('xhigh')
  expect(complete('/effort h', ctx)[0]).toEqual(['high'])
})
