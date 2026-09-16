import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const hii = process.env.HII_TEST_CHECKOUT
assert.ok(hii, 'informe HII_TEST_CHECKOUT apontando para o checkout candidato com a fixture')
async function porta() { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p }
const motorPort = await porta(), panelPort = await porta()
const token = 'fixture-bearer-nao-pode-ir-ao-navegador-123456789'
const senha = 'fixture-password-123456'
const env = { ...process.env, HII_API_TOKEN: token, HII_API_URL: `http://127.0.0.1:${motorPort}`, HII_API_REPO: 'fixture/app', HII_FIXTURE_PORT: String(motorPort), HICODE_PANEL_PASSWORD: senha, HICODE_SESSION_SECRET: 'fixture-assinatura-1234567890123456789012345' }
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
    await page.locator('select').selectOption('ask')
    await page.locator('textarea').fill('Consulta fixture sem escrita')
    await page.getByRole('button', { name: 'Perguntar', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.resposta')?.textContent.includes('nenhum card executavel'), { timeout: 10000 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow horizontal')
    await page.screenshot({ path: `/tmp/hicode-54-visual/motor-${width}.png`, fullPage: true })
    assert.deepEqual(erros, [])
    await page.close()
    console.log(`${width}px: autenticacao, HTTP/SSE, hierarquia, metricas, XSS, ask readonly e token server-side OK`)
  }
} catch (e) { console.error(saidas.slice(-20).join('')); throw e }
finally { await browser?.close(); panel.kill('SIGTERM'); motor.kill('SIGTERM') }
