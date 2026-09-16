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
function subir(cmd, args, cwd) { const p = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => saidas.push(String(d))); p.stderr.on('data', d => saidas.push(String(d))); return p }
const motor = subir(process.execPath, ['test/fixtures/api-observabilidade-server.ts'], hii)
const panel = subir(process.execPath, ['node_modules/nuxt/bin/nuxt.mjs', 'dev', '--host', '127.0.0.1', '--port', String(panelPort)], resolve('panel'))
const base = `http://127.0.0.1:${panelPort}`
let browser
try {
  let pronto = false
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(base + '/motor', { signal: AbortSignal.timeout(5000) })).ok) { pronto = true; break } } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  assert.ok(pronto, saidas.slice(-10).join(''))
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
    assert.ok(!pedidos.some(p => p.includes('/api/motor/')), 'pagina iniciou integracao legada')
    await page.locator('.pedido select').selectOption('ask')
    await page.locator('textarea').fill('Consulta fixture sem escrita')
    await page.getByRole('button', { name: 'Perguntar', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.resposta')?.textContent.includes('nenhum card executavel'), { timeout: 10000 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow horizontal')
    await page.locator('.configuracao summary').click()
    await page.locator('.configuracao select').first().selectOption('step')
    await page.locator('.configuracao select').nth(1).selectOption('ollama')
    await page.getByRole('button', { name: 'Salvar preferencia', exact: true }).click()
    await page.getByText('Preferencia salva para os proximos despachos.').waitFor()
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
    assert.deepEqual(erros, [])
    await page.close()
    console.log(`${width}px: autenticacao, HTTP/SSE, hierarquia, metricas, XSS, ask readonly, configuracao/ETag, conflito sem sobrescrita token server-side e descoberta/epico persistidos OK`)
  }
} catch (e) { console.error(saidas.slice(-20).join('')); throw e }
finally { await browser?.close(); panel.kill('SIGTERM'); motor.kill('SIGTERM'); rmSync(panelCards, { recursive: true, force: true }) }
