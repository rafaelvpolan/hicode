import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { chromium } from 'playwright'
const temp = mkdtempSync(join(tmpdir(), 'hicode-status-e2e-'))
const cards = join(temp, 'cards')
mkdirSync(cards)
const cardFile = join(cards, '025-regressao.md')
const original = '---\nid: 025\nstatus: READY\nrepo: fixture/app\ntitle: Regressao de fila\n---\n## Objetivo\nTarefa de teste sem IA.\n'
writeFileSync(cardFile, original)
writeFileSync(join(temp, 'repos.json'), '[]')
let estado = 'desligado', status = 200
const token = 'fixture-estado-sem-segredo-123456789012'
const motor = createServer((req, res) => {
  assert.equal(req.headers.authorization, 'Bearer ' + token)
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ protocolo: 1, estado, versao: '2.0.0', versaoEmExecucao: estado === 'ligado' ? '1.9.0' : null, fila: 'a'.repeat(64), consultadoEm: new Date().toISOString(), motivo: estado === 'ligado' ? 'Daemon ligado.' : 'Daemon desligado; API acessivel.' }))
})
await new Promise(r => motor.listen(0, '127.0.0.1', r))
const reservar = createServer()
await new Promise(r => reservar.listen(0, '127.0.0.1', r))
const port = reservar.address().port
await new Promise(r => reservar.close(r))
const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', HICODE_ROOT: temp, HICODE_CARDS_DIR: cards, HICODE_REPOS_FILE: join(temp, 'repos.json'), HICODE_IA_FILE: join(temp, 'ia.json'), HICODE_RUNNER_PIDFILE: join(temp, 'runner.pid'), HICODE_RUNNER_LOCK: join(temp, 'runner.lock'), HII_API_URL: 'http://127.0.0.1:' + motor.address().port, HII_API_TOKEN: token, HICODE_MOTOR_AUTOSTART: '0' }
const panel = spawn(process.execPath, ['.output/server/index.mjs'], { cwd: resolve('panel'), env, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
panel.stdout.on('data', d => { output += d }); panel.stderr.on('data', d => { output += d })
const base = 'http://127.0.0.1:' + port
let browser
try {
  let pronto = false
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/api/motor/status')).ok) { pronto = true; break } } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
  assert.ok(pronto, output)
  for (const caso of ['desligado', 'ligado', 'desconhecido']) {
    estado = caso
    const r = await fetch(base + '/api/cards/025/start', { method: 'POST' })
    assert.equal(r.status, 503, caso)
    assert.equal(readFileSync(cardFile, 'utf8'), original)
  }
  browser = await chromium.launch({ headless: true })
  mkdirSync('/tmp/hicode-status-visual', { recursive: true })
  for (const width of [1365, 390]) {
    estado = 'desligado'
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    // O aviso precisa existir mesmo se o SSE nunca conectar.
    await page.route('**/api/motor/eventos', r => r.abort())
    await page.goto(base)
    await page.getByText('HII · Desligado', { exact: true }).waitFor()
    await page.getByText('Versão 2.0.0', { exact: true }).waitFor()
    estado = 'ligado'
    await page.getByRole('button', { name: 'Atualizar status' }).click()
    await page.getByText('HII · Ligado', { exact: true }).waitFor()
    await page.getByText('Versão 1.9.0', { exact: true }).waitFor()
    await page.getByRole('button', { name: /começar/ }).click()
    await page.getByRole('alert').filter({ hasText: 'filas diferentes' }).waitFor()
    assert.equal(readFileSync(cardFile, 'utf8'), original)
    status = 401
    await page.getByRole('button', { name: 'Atualizar status' }).click()
    await page.getByText('HII · Acesso recusado', { exact: true }).waitFor()
    status = 200
    await page.getByRole('button', { name: 'Atualizar status' }).click()
    await page.getByText('HII · Ligado', { exact: true }).waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow ' + width)
    assert.ok(!(await page.locator('body').textContent()).includes(token))
    await page.screenshot({ path: '/tmp/hicode-status-visual/status-' + width + '.png', fullPage: true })
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log('E2E: status + versao ao abrir, sem SSE; HTTP bloqueia filas divergentes; desktop e 390px aprovados.')
} finally {
  await browser?.close()
  panel.kill('SIGTERM')
  await new Promise(r => { if (panel.exitCode !== null) r(); else panel.once('exit', r) })
  motor.closeAllConnections()
  await new Promise(r => motor.close(r))
  rmSync(temp, { recursive: true, force: true })
}
