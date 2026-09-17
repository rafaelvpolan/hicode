import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const hii = process.env.HII_TEST_CHECKOUT
assert.ok(hii, 'informe HII_TEST_CHECKOUT apontando para o checkout candidato com a fixture')
async function porta() { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p }
const motorPort = await porta(), panelPort = await porta()
const token = 'fixture-bearer-nao-pode-ir-ao-navegador-123456789'
const senha = 'fixture-password-123456'
const panelCards = mkdtempSync(join(tmpdir(), 'hicode-planejamento-e2e-'))
const env = { ...process.env, HICODE_CARDS_DIR: panelCards, HICODE_DISCOVERY_REPOS: 'fixture/app', HII_API_TOKEN: token, HII_API_URL: `http://127.0.0.1:${motorPort}`, HII_API_REPO: 'fixture/app', HII_FIXTURE_PORT: String(motorPort), HII_FIXTURE_ADMIN: '1', HICODE_PANEL_PASSWORD: senha, HICODE_SESSION_SECRET: 'fixture-assinatura-1234567890123456789012345' }
const saidas = []
function subir(cmd, args, cwd) { const p = spawn(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] }); p.stdout.on('data', d => saidas.push(String(d))); p.stderr.on('data', d => saidas.push(String(d))); return p }
const motor = subir(process.execPath, ['test/fixtures/api-observabilidade-server.ts'], hii)
const panel = subir(process.execPath, ['node_modules/nuxt/bin/nuxt.mjs', 'dev', '--host', '127.0.0.1', '--port', String(panelPort)], resolve('panel'))
const base = `http://127.0.0.1:${panelPort}`
let browser
try {
  let pronto = false
  let ultimaResposta = ''
  for (let i = 0; i < 240; i++) {
    try { const r = await fetch(base + '/motor', { signal: AbortSignal.timeout(5000) }); if (r.ok) { pronto = true; break }; ultimaResposta = String(r.status) + ' ' + (await r.text()).slice(0, 1500) } catch (e) { ultimaResposta = String(e) }
    await new Promise(r => setTimeout(r, 250))
  }
  assert.ok(pronto, ultimaResposta + '\n' + saidas.slice(-10).join(''))
  const direto = await (await fetch(`${env.HII_API_URL}/v1/observabilidade/snapshot?repo=fixture/app`, { headers: { authorization: `Bearer ${token}` } })).json()
  assert.equal(direto.atividades?.length, 3, JSON.stringify(direto))
  assert.equal((await fetch(base + '/api/hii/snapshot')).status, 401)
  browser = await chromium.launch({ headless: true })
  mkdirSync('/tmp/hicode-54-visual', { recursive: true })
  for (const width of [1365, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    page.setDefaultTimeout(15000)
    const pedidos = []
    const erros = []
    page.on('request', r => { pedidos.push(r.url()); assert.ok(!JSON.stringify(r.headers()).includes(token)) })
    page.on('pageerror', e => erros.push(e.message))
    page.on('response', r => { if (r.url().includes('/api/hii/') && !r.url().includes('/eventos')) void r.text().then(t => saidas.push(`${r.status()} ${r.url()} ${t.replaceAll(token, '[REDACTED]').slice(0, 1200)}`)) })
    await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/hii/snapshot')), page.goto(base + '/motor')])
    await page.locator('input[type=password]').fill(senha)
    await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/hii/login')), page.getByRole('button', { name: 'Entrar', exact: true }).click()])
    await page.locator('.atividade').first().waitFor({ timeout: 30000 })
    await page.locator('.atividade').filter({ hasText: 'harness simulado' }).click()
    await page.waitForFunction(() => document.querySelector('.detalhe')?.textContent.includes('Saida incremental segura'))
    assert.ok((await page.locator('.detalhe').textContent()).includes('custo desconhecido'))
    assert.equal(await page.locator('.detalhe img').count(), 0)
    assert.ok(!await page.locator('body').textContent().then(t => t.includes(token)))
    assert.ok(!pedidos.some(p => p.includes('/api/motor/') && !p.endsWith('/api/motor/status')), 'pagina iniciou integracao legada')
    await page.locator('.pedido select').selectOption('ask')
    await page.locator('textarea').fill('Consulta fixture sem escrita')
    await page.getByRole('button', { name: 'Perguntar', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.resposta')?.textContent.includes('nenhum card executavel'), { timeout: 10000 })
    const sessaoAtual = await page.locator('.pedido input').inputValue()
    assert.ok(sessaoAtual, 'pergunta nao reteve a sessao')
    await page.reload()
    await page.waitForFunction(() => !!document.querySelector('.pedido input')?.value)
    assert.equal(await page.locator('.pedido input').inputValue(), sessaoAtual)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow horizontal')
    await page.locator('.configuracao summary').click()
    await page.locator('.configuracao select').first().selectOption('step')
    await page.locator('.configuracao select').nth(1).selectOption('ollama')
    await page.getByRole('button', { name: 'Salvar preferencia', exact: true }).click()
    await page.getByText('Preferencia salva para os proximos despachos.').waitFor()
    // O aviso de sucesso precede o GET que atualiza o ETag; espere a UI concluir esse GET.
    await page.waitForFunction(() => document.querySelector('.configuracao input')?.disabled === false)
    const configuracao = await fetch(env.HII_API_URL + '/v1/configuracao', { headers: { authorization: `Bearer ${token}` } })
    const concorrente = await fetch(env.HII_API_URL + '/v1/configuracao', {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
        'if-match': configuracao.headers.get('etag'), 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ versao: 1, papel: 'step', provider: 'ollama', model: `concorrente-${width}` }),
    })
    assert.equal(concorrente.status, 200)
    await page.locator('.configuracao input').fill('minha-proposta')
    await page.getByRole('button', { name: 'Salvar preferencia', exact: true }).click()
    await page.getByText('Outra gravacao alterou a configuracao.', { exact: false }).waitFor()
    await page.getByRole('button', { name: 'Reler configuracao', exact: true }).click()
    await page.getByText('Configuracao atual relida.', { exact: false }).waitFor()
    assert.equal(await page.locator('.configuracao input').inputValue(), 'minha-proposta')
    await page.screenshot({ path: `/tmp/hicode-54-visual/motor-${width}.png`, fullPage: true })
    await page.goto(base + '/planejamento?id=fixture-' + width)
    await page.getByLabel('Nome da demanda', { exact: true }).fill('Reduzir espera de suporte')
    await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click()
    await page.getByText('Revisao salva. Nenhuma execucao foi criada.', { exact: true }).waitFor()
    await page.reload()
    await page.waitForFunction(() => document.querySelector('#desc-titulo')?.value === 'Reduzir espera de suporte')
    for (const campo of ['publico', 'dor', 'situacao', 'impacto', 'evidencias', 'hipoteses', 'perguntas', 'restricoes']) {
      await page.locator('#desc-' + campo).fill('Informacao fornecida pelo operador para ' + campo + '; fonte entrevista 1')
    }
    await page.getByRole('button', { name: 'Aprovar sintese', exact: true }).click()
    await page.getByText('Sintese aprovada. Agora voce pode preparar o epico.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Preparar epico', exact: true }).click()
    await page.getByLabel('Objetivo', { exact: true }).fill('Diminuir o tempo de primeira resposta')
    await page.getByLabel('Resultado esperado', { exact: true }).fill('Fila responde em ate uma hora')
    await page.getByLabel('Metrica de sucesso', { exact: true }).fill('p95 abaixo de uma hora')
    await page.getByLabel('Escopo', { exact: true }).fill('Triagem inicial')
    await page.getByRole('button', { name: 'Adicionar tarefa de produto', exact: true }).click()
    await page.getByLabel('Titulo', { exact: true }).fill('Triagem de entradas')
    await page.getByLabel('Resultado observavel', { exact: true }).fill('Categorias visiveis para a equipe')
    await page.getByLabel('Criterios de aceite', { exact: false }).fill('Quando uma entrada chega, a categoria correspondente deve ser registrada.')
    await page.getByLabel('Justificativa', { exact: true }).fill('Desbloqueia o atendimento')
    await page.getByRole('button', { name: 'Salvar epico e tarefas', exact: true }).click()
    await page.getByText('Revisao salva. Nenhuma execucao foi criada.', { exact: true }).waitFor()
    await page.reload()
    await page.waitForFunction(() => document.body.textContent.includes('Triagem de entradas') || [...document.querySelectorAll('input')].some(i => i.value === 'Triagem de entradas'))
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow no planejamento')
    await page.screenshot({ path: `/tmp/hicode-54-visual/planejamento-${width}.png`, fullPage: true })
    await page.getByRole('link', { name: 'Triagem de entradas — detalhar e revisar', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('#documento-tecnico')?.value.includes('tecnico-'))
    const modelo = JSON.parse(await page.locator('#documento-tecnico').inputValue())
    modelo.riscos = 'Categoria incorreta exige reversao'
    for (const c of modelo.criterios) {
      c.resultado = 'Categoria correta aparece na consulta'
      c.verificacao = 'Executar teste com entrada conhecida'
    }
    modelo.microtasks[0].saida = 'Codigo e testes da classificacao'
    for (const campo of Object.keys(modelo.operacao)) modelo.operacao[campo] = 'Conferir classificacao no piloto; reverter em caso de falha'
    const fonteTecnica = JSON.stringify(modelo, null, 2) + '\n'
    await page.locator('#documento-tecnico').fill(fonteTecnica)
    // Rever distribuicao multi-IA sem despachar nem alterar o documento aprovado.
    const preview = structuredClone(modelo)
    const primeira = { ...preview.microtasks[0], id: 'preparar', ia: { provedor: 'codex', modelo: 'modelo-fixture' }, arquivos: ['src/triagem.ts'] }
    const segunda = { ...primeira, id: 'verificar', titulo: 'Verificar classificacao', agente: 'testudo', dependeDe: ['preparar'], ia: { provedor: 'claude' } }
    preview.microtasks = [segunda, primeira]
    await page.locator('#documento-tecnico').fill(JSON.stringify(preview, null, 2))
    const plano = page.getByRole('region', { name: 'Plano de execucao para revisao', exact: true })
    await plano.waitFor()
    assert.deepEqual(await plano.locator('[data-microtask]').evaluateAll(items => items.map(i => i.dataset.microtask)), ['preparar', 'verificar'])
    assert.ok((await plano.textContent()).includes('codex · modelo-fixture'))
    assert.ok((await plano.textContent()).includes('claude · Modelo resolvido pelo motor'))
    assert.ok((await plano.textContent()).includes('Previa das edicoes'))
    await plano.locator('summary').first().focus()
    await page.keyboard.press('Enter')
    await plano.getByText('Resultado: Categoria correta aparece na consulta', { exact: true }).first().waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow no plano')
    await plano.screenshot({ path: '/tmp/hicode-54-visual/plano-' + width + '.png' })
    primeira.dependeDe = ['verificar']
    await page.locator('#documento-tecnico').fill(JSON.stringify(preview, null, 2))
    await page.getByText('microtasks: Ciclo de dependencias', { exact: true }).waitFor()
    assert.equal(await plano.count(), 0, 'plano invalido nao pode manter previa anterior')
    assert.equal(await page.getByRole('button', { name: 'Aprovar revisao', exact: true }).isDisabled(), true)
    await page.locator('#documento-tecnico').fill(fonteTecnica)
    await plano.waitFor()
    assert.ok((await plano.textContent()).includes('Selecao pelo motor'))
    await page.getByRole('button', { name: 'Aprovar revisao', exact: true }).click()
    await page.getByText('Revisao aprovada. Despacho e uma acao separada.', { exact: true }).waitFor()
    // Perda da resposta depois de o backend confirmar: o retry deve reencontrar o mesmo envio.
    let interceptado = false
    await page.route('**/api/hii/tecnico', async route => {
      const b = route.request().postDataJSON()
      if (b?.acao === 'despachar' && !interceptado) {
        interceptado = true
        await route.fetch()
        await route.abort('failed')
      } else await route.continue()
    })
    await page.getByRole('button', { name: 'Despachar revisao aprovada', exact: true }).click()
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Despachar revisao aprovada')?.disabled)
    await page.unroute('**/api/hii/tecnico')
    await page.getByRole('button', { name: 'Despachar revisao aprovada', exact: true }).click()
    await page.getByText(/Execucao #.*recebida pelo motor/).waitFor()
    const mensagem = await page.getByRole('status').filter({ hasText: /^Execucao #/ }).first().textContent()
    await page.reload()
    await page.getByText(/Envio confirmado/).waitFor()
    await page.getByText('Plano do documento enviado. Consulte as evidencias para acompanhar a execucao efetiva.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Consultar/reconciliar envio', exact: true }).click()
    await page.getByText(mensagem, { exact: true }).waitFor()
    assert.equal(await page.locator('#documento-tecnico').inputValue(), fonteTecnica)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow no tecnico')
    await page.screenshot({ path: `/tmp/hicode-54-visual/tecnico-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Consultar evidencias da execucao', exact: true }).click()
    await page.getByText('Nenhuma evidencia registrada para a revisao fixada.', { exact: false }).waitFor()
    await page.goto(base + '/planejamento?id=fixture-' + width)
    await page.getByRole('button', { name: 'Consultar evidencias do epico', exact: true }).click()
    await page.getByText('Epico ainda nao concluido com evidencias.', { exact: false }).waitFor()
    await page.getByRole('heading', { name: 'Triagem de entradas · Em execucao', exact: true }).waitFor()
    await page.screenshot({ path: `/tmp/hicode-54-visual/progresso-${width}.png`, fullPage: true })
    const execucao = mensagem.match(/Execucao #(\d+)/)[1]
    async function controlar(acao, alvo = execucao) {
      const marcador = 'entrega ' + acao + ' ' + alvo
      motor.stdin.write(JSON.stringify({ id: alvo, acao }) + '\n')
      for (let i = 0; i < 100 && !saidas.some(s => s.includes(marcador)); i++) await new Promise(r => setTimeout(r, 100))
      assert.ok(saidas.some(s => s.includes(marcador)), saidas.slice(-5).join('\n'))
    }
    await controlar('certificar')
    await page.getByRole('button', { name: 'Consultar evidencias do epico', exact: true }).click()
    await page.getByRole('heading', { name: 'Triagem de entradas · Concluida com evidencia', exact: true }).waitFor()
    await page.getByText('Epico concluido com evidencias na consulta.', { exact: false }).waitFor()
    await page.getByText('Ver criterios da execucao #' + execucao, { exact: true }).click()
    await page.getByText('Entrega verificada no PR:', { exact: false }).waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow na prova de entrega')
    await page.locator('.progresso').screenshot({ path: '/tmp/hicode-54-visual/entrega-' + width + '.png' })
    await controlar('divergir')
    await page.getByRole('button', { name: 'Consultar evidencias do epico', exact: true }).click()
    await page.getByRole('heading', { name: 'Triagem de entradas · Verificacao inconclusiva', exact: true }).waitFor()
    await page.getByText('Epico ainda nao concluido com evidencias.', { exact: false }).waitFor()

    // Duas tarefas na mesma revisao: a sucessora nao cria envio antes da prova.
    const planejamentoDeps = 'dependencias-' + width
    const planejamentoOriginal = await (await page.request.get(base + '/api/hii/planejamento?id=fixture-' + width)).json()
    const documentoDeps = structuredClone(planejamentoOriginal.planejamento.documento)
    documentoDeps.id = planejamentoDeps
    const tarefaBase = { ...documentoDeps.epico.tarefas[0], id: 'base', dependeDe: [], cardExistente: '' }
    documentoDeps.epico.tarefas = [tarefaBase, { ...tarefaBase, id: 'sucessora', titulo: 'Consumir entrega anterior', dependeDe: ['base'] }]
    const salvoDeps = await page.request.post(base + '/api/hii/planejamento', { data: { documento: documentoDeps, revisao: 0, chave: crypto.randomUUID(), aprovar: true } })
    assert.equal(salvoDeps.status(), 200, await salvoDeps.text())
    const revisaoDeps = (await salvoDeps.json()).revisao
    for (const produto of ['base', 'sucessora']) {
      const tecnicoDeps = { ...modelo, id: 'tecnico-' + produto, produtoId: produto, origem: { planejamento: planejamentoDeps, revisao: revisaoDeps }, dependencias: produto === 'base' ? [] : ['base'] }
      const r = await page.request.post(base + '/api/hii/tecnico', { data: { planejamento: planejamentoDeps, produto, acao: 'salvar', fonte: JSON.stringify(tecnicoDeps, null, 2) + '\n', revisao: 0, chave: crypto.randomUUID(), aprovar: true } })
      assert.equal(r.status(), 200, await r.text())
    }
    await page.goto(base + '/tecnico?planejamento=' + planejamentoDeps + '&produto=sucessora')
    await page.getByRole('button', { name: 'Despachar revisao aprovada', exact: true }).click()
    await page.getByText('Dependencia sem revisao aprovada e execucao: base', { exact: false }).waitFor()
    const pendenteDeps = await (await page.request.get(base + '/api/hii/tecnico?planejamento=' + planejamentoDeps + '&produto=sucessora')).json()
    assert.equal(pendenteDeps.revisao.envio, null)
    const enviadoBase = await page.request.post(base + '/api/hii/tecnico', { data: { planejamento: planejamentoDeps, produto: 'base', acao: 'despachar', revisao: 1 } })
    assert.equal(enviadoBase.status(), 200, await enviadoBase.text())
    const baseId = (await enviadoBase.json()).envio.execucao
    await controlar('certificar', baseId)
    await page.getByRole('button', { name: 'Despachar revisao aprovada', exact: true }).click()
    await page.getByText(/Execucao #.*recebida pelo motor/).waitFor()
    const enviadaDeps = await (await page.request.get(base + '/api/hii/tecnico?planejamento=' + planejamentoDeps + '&produto=sucessora')).json()
    assert.equal(enviadaDeps.revisao.envio.dependencias[0].execucao, baseId)
    const repetidaDeps = await page.request.post(base + '/api/hii/tecnico', { data: { planejamento: planejamentoDeps, produto: 'sucessora', acao: 'despachar', revisao: 1 } })
    assert.equal((await repetidaDeps.json()).envio.execucao, enviadaDeps.revisao.envio.execucao)
    await page.screenshot({ path: '/tmp/hicode-54-visual/dependencias-' + width + '.png', fullPage: true })

    assert.deepEqual(erros, [])
    await page.close()
    console.log(`${width}px: autenticacao, HTTP/SSE, hierarquia, metricas, XSS, ask readonly, configuracao/ETag, conflito sem sobrescrita token server-side descoberta/epico e despacho tecnico, entrega arquivada, invalidacao remota e despacho dependente OK`)
  }
} catch (e) { console.error(saidas.slice(-20).join('')); throw e }
finally { await browser?.close(); panel.kill('SIGTERM'); motor.kill('SIGTERM'); rmSync(panelCards, { recursive: true, force: true }) }
