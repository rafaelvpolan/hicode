import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { chromium } from 'playwright'

const temp = mkdtempSync(join(tmpdir(), 'hicode-prompt-e2e-'))
const repo = 'fixture/app'
const token = 'fixture-token-sem-segredo-123456789012345'
const senha = 'fixture-painel-123456'
let revisao = 1, status = 'CLARIFY', provedor = '', modelo = '', aprovacoes = 0
const escolhas = []
let recusarModelo = true
const etag = () => '"' + revisao + '"'
const perguntas = () => status === 'CLARIFY' ? { perguntaId: 'pacote-' + revisao, pendencia: { origem: 'pacote', indice: 0, atual: { q: 'Revise antes de executar', options: ['Aprovar e executar', 'Cancelar a tarefa'] } } } : { perguntaId: null, pendencia: null }
const motor = createServer(async (req, res) => {
  try {
    assert.equal(req.headers.authorization, 'Bearer ' + token)
    const path = new URL(req.url, 'http://fixture').pathname
    let dado
    if (req.method === 'POST') {
      const pedacos = []
      for await (const pedaco of req) pedacos.push(pedaco)
      const b = JSON.parse(Buffer.concat(pedacos).toString())
      assert.equal(req.headers['if-match'], etag())
      if (path.endsWith('/ia') && b.modelo && recusarModelo) { recusarModelo = false; res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'fixture: aplicacao temporariamente indisponivel' })); return }
      if (path.endsWith('/ia')) { provedor = b.provedor; modelo = b.modelo || ''; escolhas.push(b); revisao++; dado = { id: '025', ias: ias() } }
      else if (path.endsWith('/respostas')) { assert.equal(b.perguntaId, 'pacote-' + revisao); assert.equal(b.texto, 'Aprovar e executar'); aprovacoes++; status = 'EXECUTING'; revisao++; dado = { ok: true } }
      else throw new Error('POST inesperado: ' + path)
    } else if (path === '/v1/estado') dado = { protocolo: 1, estado: 'ligado', versao: '0.1.0', versaoEmExecucao: '0.1.0', fila: 'a'.repeat(64), consultadoEm: new Date().toISOString(), motivo: 'Fixture ligada.' }
    else if (path === '/v1/capacidades') dado = { versao: 1, observabilidade: { versoes: [1] }, configuracao: { versoes: [1], leitura: true, escrita: true } }
    else if (path === '/v1/observabilidade/snapshot') dado = { versao: 1, cursor: '0', atividades: [], degradado: false, motivo: null, proxima: null }
    else if (path === '/v1/configuracao') dado = { versao: 1, preferencias: {}, limites: { tetoUsdPorCard: 5, tetoTokensPorCard: 200000, avisoDeCotaPct: 80 } }
    else if (path === '/v1/provedores') dado = { provedores: ['claude', 'codex', 'claude-ollama', 'codex-ollama'].map(nome => ({ nome, aptidao: { agentic: true, isolatesReadonly: true, emitsStructuredJson: true } })) }
    else if (path.endsWith('/perguntas')) dado = perguntas()
    else if (path.endsWith('/pacote')) dado = { hash: 'pacote-' + revisao, status: status === 'CLARIFY' ? 'aguardando' : 'aprovado', resumo: 'IA recomendada e limites', markdown: 'Prompt completo da fixture · IA ' + provedor + ' · modelo ' + modelo }
    else if (path.endsWith('/ia')) dado = { id: '025', ias: ias() }
    else if (path === '/v1/tarefas/025') { if (revisao === 2) await new Promise(r => setTimeout(r, 200)); dado = { campos: { repo, status }, objetivo: 'fixture' } }
    else throw new Error('GET inesperado: ' + path)
    res.writeHead(200, { 'content-type': 'application/json', etag: etag() })
    res.end(JSON.stringify(dado))
  } catch (e) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e) })) }
})
function ias() { return ['implement', 'verify', 'gate', 'step'].map(papel => ({ papel, provedor: papel === 'implement' ? provedor : '', modelo: papel === 'implement' ? modelo : '' })) }
await new Promise(r => motor.listen(0, '127.0.0.1', r))
const reserva = createServer()
await new Promise(r => reserva.listen(0, '127.0.0.1', r))
const port = reserva.address().port
await new Promise(r => reserva.close(r))
const panel = spawn(process.execPath, ['.output/server/index.mjs'], { cwd: resolve('panel'), env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', HICODE_ROOT: temp, HII_API_URL: 'http://127.0.0.1:' + motor.address().port, HII_API_TOKEN: token, HII_API_REPO: repo, HICODE_PANEL_PASSWORD: senha, HICODE_SESSION_SECRET: 'fixture-secret-123456789012345678901234567890', HICODE_MOTOR_AUTOSTART: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
panel.stdout.on('data', d => { output += d }); panel.stderr.on('data', d => { output += d })
const base = 'http://127.0.0.1:' + port
let browser
try {
  let pronto = false
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/motor')).ok) { pronto = true; break } } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
  assert.ok(pronto, output)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/api/hii/eventos', r => r.abort())
  await page.goto(base + '/motor')
  await page.getByLabel('Credencial do painel').fill(senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByText('Nenhuma atividade observada neste projeto.', { exact: true }).waitFor()
  await page.getByLabel('ID da tarefa').fill('025')
  await page.getByRole('button', { name: 'Abrir tarefa', exact: true }).click()
  await page.getByText(/Prompt completo da fixture/).waitFor()
  assert.equal(aprovacoes, 0, 'abrir o prompt nao pode aprovar')
  await page.getByRole('combobox', { name: 'Implementa', exact: true }).selectOption('codex-ollama')
  await page.waitForFunction(() => document.querySelector('input[aria-label="Modelo que implementa"]') && !document.querySelector('input[aria-label="Modelo que implementa"]').disabled)
  await page.getByLabel('Modelo que implementa').fill('modelo-local')
  await page.waitForTimeout(350)
  assert.equal(await page.getByLabel('Modelo que implementa').inputValue(), 'modelo-local', 'atualizacao da tarefa nao pode apagar modelo digitado')
  assert.equal(await page.getByRole('button', { name: 'Aprovar e executar', exact: true }).isDisabled(), true, 'modelo pendente precisa ser aplicado antes da aprovacao')
  await page.getByRole('button', { name: 'Aplicar modelo', exact: true }).click()
  await page.getByText(/O motor recusou a troca de IA/).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Aprovar e executar', exact: true }).isDisabled(), true, 'aplicacao recusada nao pode liberar aprovacao do modelo pendente')
  await page.getByRole('button', { name: 'Aplicar modelo', exact: true }).click()
  await page.getByText(/Prompt completo da fixture.*modelo-local/).waitFor()
  assert.equal(aprovacoes, 0, 'escolher IA ou modelo nao pode executar')
  assert.equal(escolhas.at(-1).modelo, 'modelo-local')
  for (const width of [1365, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow do prompt ' + width)
    mkdirSync('/tmp/hicode-prompt-visual', { recursive: true })
    await page.screenshot({ path: '/tmp/hicode-prompt-visual/pacote-pendente-' + width + '.png', fullPage: true })
  }
  await page.getByRole('button', { name: 'Aprovar e executar', exact: true }).click()
  await page.getByRole('heading', { name: 'Tarefa #025 · EXECUTING', exact: true }).waitFor()
  assert.equal(aprovacoes, 1)
  await page.reload()
  await page.getByRole('heading', { name: 'Tarefa #025 · EXECUTING', exact: true }).waitFor()
  for (const width of [1365, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow ' + width)
    mkdirSync('/tmp/hicode-prompt-visual', { recursive: true })
    await page.screenshot({ path: '/tmp/hicode-prompt-visual/prompt-' + width + '.png', fullPage: true })
  }
  assert.deepEqual(errors, [])
  console.log('OK: prompt antes de atividades, troca de IA/modelo sem execucao, aprovacao com revisao, retomada apos reload e layout desktop/mobile.')
} finally {
  await browser?.close()
  panel.kill('SIGTERM')
  await new Promise(r => { if (panel.exitCode !== null) r(); else panel.once('exit', r) })
  motor.closeAllConnections()
  await new Promise(r => motor.close(r))
  rmSync(temp, { recursive: true, force: true })
}
