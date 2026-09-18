import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const hii = process.env.HII_TEST_CHECKOUT
assert.ok(hii, 'HII_TEST_CHECKOUT obrigatorio')
const base = mkdtempSync(join(tmpdir(), 'hicode-recuperacao-e2e-'))
const logs = []
const children = []
let browser
async function porta() {
  const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r))
  const p = s.address().port; await new Promise(r => s.close(r)); return p
}
const motorPort = await porta(), panelPort = await porta()
const token = 'fixture-recuperacao-segredo-12345678901234567890'
const projeto = join(base, 'projeto'), wt = join(base, 'wt')
for (const d of ['panel', 'motor', 'config', 'projeto']) mkdirSync(join(base, d))
execFileSync('git', ['init', '-q', projeto])
execFileSync('git', ['-C', projeto, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', 'commit', '--allow-empty', '-qm', 'base'])
execFileSync('git', ['-C', projeto, 'worktree', 'add', '-qb', 'fixture-025', wt], { stdio: 'ignore' })
writeFileSync(join(wt, 'trabalho-preservado.txt'), 'alteracao parcial importante')
writeFileSync(join(base, 'repos.json'), JSON.stringify([{ name: 'fixture/app', path: projeto }]))
writeFileSync(join(base, 'config/repos.json'), JSON.stringify([{ name: 'fixture/app', url: 'https://github.com/fixture/app', branch: 'main' }]))
const originais = {}
for (const [nome, id, status] of [['020-a.md', '020', 'EXECUTING'], ['020-b.md', '020', 'MERGED'], ['025-icones.md', '025', 'PAUSED']]) {
  const texto = '---\nid: ' + id + '\nrepo: fixture/app\ntitle: ' + (id === '025' ? 'Recuperar icones fixture' : nome) + '\nstatus: ' + status
    + (id === '025' ? '\ncost_usd: 0.15\nbranch: fixture-025\nworktree: ' + wt : '') + '\n---\nObjetivo original e historico intactos\n'
  originais[nome] = texto; writeFileSync(join(base, 'panel', nome), texto)
}
const env = { ...process.env, HICODE_ROOT: base, HICODE_CARDS_DIR: join(base, 'panel'), HICODE_REPOS_FILE: join(base, 'config/repos.json'),
  HII_ROOT: hii, HII_CARDS_DIR: join(base, 'motor'), HII_REPOS_FILE: join(base, 'repos.json'), HII_IA_FILE: join(base, 'ia.json'),
  HII_RUNNER_LOCK: join(base, 'runner.lock'), HII_API_TOKEN: token, HII_API_URL: 'http://127.0.0.1:' + motorPort,
  HII_FIXTURE_PORT: String(motorPort), HII_RECUPERACAO_FIXTURE: '1' }
delete env.HICODE_PANEL_PASSWORD
writeFileSync(env.HII_IA_FILE, '{}')
function subir(args, cwd) {
  const p = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  p.stdout.on('data', b => logs.push(String(b))); p.stderr.on('data', b => logs.push(String(b)))
  children.push(p); return p
}
const url = 'http://127.0.0.1:' + panelPort
try {
  subir(['test/fixtures/api-recuperacao-server.ts'], hii)
  subir(['node_modules/nuxt/bin/nuxt.mjs', 'dev', '--host', '127.0.0.1', '--port', String(panelPort)], resolve('panel'))
  let ready = false
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) { ready = true; break } } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  assert.ok(ready, logs.slice(-10).join(''))
  browser = await chromium.launch({ headless: true })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } })
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', r => assert.ok(!JSON.stringify(r.headers()).includes(token)))
  await page.goto(url)
  const card = page.locator('.linha').filter({ hasText: 'Recuperar icones fixture' })
  await card.getByRole('button', { name: 'Diagnosticar recuperacao', exact: true }).click()
  await card.getByRole('button', { name: 'Preservar e vincular ao HII', exact: true }).click()
  await card.getByRole('button', { name: 'Confirmar revalidacao da etapa', exact: true }).waitFor()
  assert.equal(await card.getByRole('button', { name: 'Retomar pelo motor', exact: true }).isDisabled(), true)
  await page.reload()
  await card.getByRole('button', { name: 'Confirmar revalidacao da etapa', exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Retomar pelo motor' && !b.disabled))
  await page.setViewportSize({ width: 390, height: 900 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow em 390px')
  mkdirSync('/tmp/hicode-recuperacao-visual', { recursive: true })
  await card.screenshot({ path: '/tmp/hicode-recuperacao-visual/390-previa.png' })
  await card.getByRole('button', { name: 'Retomar pelo motor', exact: true }).click()
  await card.locator('.recuperacao strong').filter({ hasText: 'EXECUTING' }).waitFor()
  await page.reload()
  await card.locator('.recuperacao strong').filter({ hasText: 'EXECUTING' }).waitFor()
  assert.equal(readdirSync(env.HII_CARDS_DIR).filter(n => n.endsWith('.md')).length, 1)
  for (const [nome, original] of Object.entries(originais)) assert.equal(readFileSync(join(base, 'panel', nome), 'utf8'), original)
  assert.equal(readFileSync(join(wt, 'trabalho-preservado.txt'), 'utf8'), 'alteracao parcial importante')
  assert.deepEqual(errors, [])
  assert.ok(!(await page.locator('body').innerText()).includes(token))
  console.log('PASS: processos separados, filas distintas, #020 duplicado preservado, #025 vinculado e retomado pela API, reload, desktop e 390px. Presenca do daemon simulada; nenhuma IA executada.')
} catch (e) {
  console.error(logs.slice(-20).join('').replaceAll(token, '[REDACTED]'))
  throw e
} finally {
  await browser?.close()
  for (const p of children.reverse()) { p.kill('SIGTERM'); await new Promise(r => { p.once('exit', r); setTimeout(() => { if (p.exitCode === null) p.kill('SIGKILL'); r() }, 3000).unref() }) }
  rmSync(base, { recursive: true, force: true })
}
