import { chromium } from 'playwright'

const url = process.argv[2]
const out = process.argv[3] || ''

const errors = []
let ok = true
let conclusive = false
let detail = ''

try {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    page.on('console', (m) => { if (m.type() === 'error') errors.push(String(m.text()).slice(0, 240)) })
    page.on('pageerror', (e) => errors.push(String((e && e.message) || e).slice(0, 240)))
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    conclusive = true
    const status = resp ? resp.status() : 0
    const overlay = await page.waitForSelector('vite-error-overlay', { timeout: 3000, state: 'attached' }).catch(() => null)
    if (!overlay) await page.waitForTimeout(1200)
    if (overlay) {
      ok = false
      const txt = await overlay.innerText().catch(() => '')
      detail = 'overlay de erro do Vite: ' + String(txt).replace(/\s+/g, ' ').slice(0, 240)
    } else if (status >= 500) {
      ok = false
      detail = 'HTTP ' + status
    } else if (errors.length) {
      ok = false
      detail = 'erro no console: ' + errors[0]
    }
    if (out) await page.screenshot({ path: out, fullPage: true }).catch(() => {})
  } finally {
    await browser.close().catch(() => {})
  }
} catch (e) {
  ok = false
  conclusive = false
  detail = 'inspecao nao concluida: ' + String((e && e.message) || e).slice(0, 220)
}

process.stdout.write(JSON.stringify({ ok, conclusive, detail, errors }))
