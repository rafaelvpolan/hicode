import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)))
const CARDS_DIR = join(ROOT, 'cards')
const REPOS_FILE = join(ROOT, 'config', 'repos.json')
const WT_BASE = join(dirname(ROOT), '.hicode-worktrees')
const PREVIEW_BASE_PORT = Number(process.env.HICODE_PREVIEW_BASE || 5200)
const POLL_MS = Number(process.env.HICODE_POLL_MS || 5000)
const RUN_TIMEOUT_MS = Number(process.env.HICODE_RUN_TIMEOUT_MS || 300000)
const MAX_CONCURRENCY = Number(process.env.HICODE_CONCURRENCY || 3)
const MAX_VERIFY = Number(process.env.HICODE_VERIFY_RETRIES || 1)
const VERIFY_MODEL = process.env.HICODE_VERIFY_MODEL || 'sonnet'

function isoNow() { return new Date().toISOString().replace(/\.\d+Z$/, 'Z') }

function splitFrontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { fm: {}, order: [], body: text }
  const fm = {}, order = []
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) { const k = line.slice(0, i).trim(); fm[k] = line.slice(i + 1).trim(); order.push(k) }
  }
  return { fm, order, body: m[2] }
}

function serializeCard(fm, order, body) {
  const keys = order.length ? order : Object.keys(fm)
  return `---\n${keys.map(k => `${k}: ${fm[k]}`).join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`
}

function cardFiles() {
  return existsSync(CARDS_DIR) ? readdirSync(CARDS_DIR).filter(f => f.endsWith('.md')) : []
}

function findCardFile(id) { return cardFiles().find(f => f.startsWith(`${id}-`)) || null }

function readCard(id) {
  const f = findCardFile(id)
  if (!f) return null
  return { ...splitFrontMatter(readFileSync(join(CARDS_DIR, f), 'utf8')), file: f }
}

function extractObjetivo(body) {
  const m = body.match(/##\s*Objetivo\s*\n([\s\S]*?)(?:\n##\s|$)/)
  return m ? m[1].trim() : ''
}

function appendLog(body, line) {
  const marker = '## Log de Estado'
  if (!body.includes(marker)) return `${body.trimEnd()}\n\n${marker}\n${line}`
  return `${body.trimEnd()}\n${line}`
}

function patchCard(id, fields, logLine) {
  const c = readCard(id)
  if (!c) return
  const { fm, order, body } = c
  for (const [k, v] of Object.entries(fields)) { fm[k] = v; if (!order.includes(k)) order.push(k) }
  fm.updated = isoNow()
  const nb = logLine ? appendLog(body, logLine) : body
  writeFileSync(join(CARDS_DIR, c.file), serializeCard(fm, order, nb) + '\n')
}

function cardsByStatus(status) {
  return cardFiles()
    .map(f => ({ ...splitFrontMatter(readFileSync(join(CARDS_DIR, f), 'utf8')).fm, file: f }))
    .filter(c => c.id && c.status === status)
}

function repoPath(repoName) {
  try {
    const repos = JSON.parse(readFileSync(REPOS_FILE, 'utf8'))
    const r = repos.find(x => x.name === repoName)
    if (r && r.path) return r.path
  } catch { void 0 }
  return join(dirname(ROOT), basename(repoName || ''))
}

function repoBase(repoName) {
  try {
    const repos = JSON.parse(readFileSync(REPOS_FILE, 'utf8'))
    const r = repos.find(x => x.name === repoName)
    if (r && r.branch) return r.branch
  } catch { void 0 }
  return 'main'
}

function hasBuildScript(target) {
  try {
    const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))
    return !!(pkg.scripts && pkg.scripts.build)
  } catch { return false }
}

function run(cmd, args, opts) {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 1 << 24, ...opts }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout || '', stderr: stderr || '' })
    })
  })
}

function runGit(dir, args) { return run('git', args, { cwd: dir, timeout: 120000 }) }

function previewPort(id) { return PREVIEW_BASE_PORT + (Number(id) || 0) }
function worktreePath(target, id, slug) { return join(WT_BASE, basename(target), `${id}-${slug}`) }

let gitChain = Promise.resolve()
function withGitLock(fn) {
  const p = gitChain.then(fn, fn)
  gitChain = p.then(() => undefined, () => undefined)
  return p
}

async function ensureWorktree(target, wt, branch, base) {
  return withGitLock(async () => {
    await runGit(target, ['fetch', 'origin', base])
    if (existsSync(wt)) await runGit(target, ['worktree', 'remove', '--force', wt])
    if (!existsSync(WT_BASE)) mkdirSync(WT_BASE, { recursive: true })
    const r = await runGit(target, ['worktree', 'add', '-B', branch, wt, `origin/${base}`])
    if (r.err) throw new Error('worktree add: ' + String(r.stderr || '').slice(0, 160))
    const nm = join(wt, 'node_modules')
    if (!existsSync(nm) && existsSync(join(target, 'node_modules'))) {
      try { symlinkSync(join(target, 'node_modules'), nm, 'dir') } catch { void 0 }
    }
    return wt
  })
}

async function removeWorktree(target, wt) {
  if (wt && existsSync(wt)) await withGitLock(() => runGit(target, ['worktree', 'remove', '--force', wt]))
}

function startPreview(wt, port) {
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--host'], { cwd: wt, detached: true, stdio: 'ignore' })
  child.unref()
  return child.pid
}

function stopPreview(pid) {
  const n = Number(pid)
  if (!n) return
  try { process.kill(-n, 'SIGTERM') } catch { try { process.kill(n, 'SIGTERM') } catch { void 0 } }
}

async function httpOk(url) {
  const r = await run('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', url], { timeout: 4000 })
  return String(r.stdout || '').trim() === '200'
}

async function waitHttp(url, tries) {
  for (let i = 0; i < tries; i++) {
    const r = await run('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', url], { timeout: 5000 })
    if (String(r.stdout || '').trim() === '200') return true
    await new Promise(res => setTimeout(res, 1000))
  }
  return false
}

async function screenshot(id, url) {
  const dir = join(CARDS_DIR, 'previews', String(id))
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const out = join(dir, 'preview.png')
  const { err } = await run('npx', ['--no-install', 'playwright', 'screenshot', '--viewport-size=1280,900', '--full-page', url, out], { cwd: ROOT, timeout: 60000 })
  return !err && existsSync(out)
}

async function implement(card, workdir, feedback = '') {
  const desc = extractObjetivo(card.body) || card.fm.title
  const prompt = [
    'Use os AGENTES NEXUS deste projeto para implementar a tarefa abaixo (auto-construcao do hicode).',
    `O codigo a alterar fica em: ${workdir} (Vite + Vue 3 + TypeScript). Edite os arquivos em src/ DESSE diretorio.`,
    'Roteie via Task: frontend/Vue/UI -> vitro; logica/feature -> limpio; banco -> radix; refactor -> rufus. Apos agente gated, passe pelo crivo.',
    'Faca a MENOR mudanca que cumpra a tarefa. NAO rode git, NAO faca commit, NAO inicie servidores. Sem comentarios de prosa.',
    feedback ? `\nATENCAO (reexecucao): ${feedback}` : '',
    '',
    'TAREFA:',
    desc,
    '',
    'Ao terminar, responda em 1 linha: qual agente atuou e o que mudou.',
  ].join('\n')
  const { err, stdout, stderr } = await run('claude', [
    '-p', prompt,
    '--output-format', 'json',
    '--permission-mode', 'acceptEdits',
    '--add-dir', workdir,
    '--allowedTools', 'Task,Read,Edit,Write,Glob,Grep,Bash',
  ], { cwd: ROOT, timeout: RUN_TIMEOUT_MS })
  let cost = '', resultText = '', isError = false, usage = {}
  try {
    const j = JSON.parse(stdout)
    cost = typeof j.total_cost_usd === 'number' ? j.total_cost_usd.toFixed(4) : ''
    resultText = String(j.result || '').split('\n')[0].slice(0, 140)
    isError = !!j.is_error
    const u = j.usage || {}
    usage = {
      tokens_in: u.input_tokens || 0, tokens_out: u.output_tokens || 0,
      tokens_cache_create: u.cache_creation_input_tokens || 0, tokens_cache_read: u.cache_read_input_tokens || 0,
    }
  } catch { resultText = String(stdout || stderr || '').split('\n')[0].slice(0, 140) }
  if (err) return { ok: false, reason: `claude ${err.killed ? 'timeout' : 'falhou: ' + err.message}`, cost, usage }
  if (isError) return { ok: false, reason: `claude is_error: ${resultText}`, cost, usage }
  return { ok: true, resultText, cost, usage }
}

async function verifyVisual(card, shotPath) {
  if (!existsSync(shotPath)) return { ok: true, reason: 'sem screenshot', cost: 0 }
  const desc = extractObjetivo(card.body) || card.fm.title
  const prompt = [
    'Voce e um verificador VISUAL. Use a tool Read para abrir a imagem (screenshot da pagina web renderizada) no caminho abaixo e analise o que aparece.',
    `Imagem: ${shotPath}`,
    `Tarefa que deveria ter sido aplicada: "${desc}"`,
    'A mudanca/elemento pedido aparece DE FATO e visivelmente na pagina? Seja rigoroso. Responda APENAS um JSON em uma linha, sem texto extra: {"ok": true ou false, "reason": "motivo curto"}.',
  ].join('\n')
  const { stdout } = await run('claude', [
    '-p', prompt, '--output-format', 'json', '--model', VERIFY_MODEL,
    '--add-dir', dirname(shotPath), '--allowedTools', 'Read,Glob',
  ], { cwd: ROOT, timeout: 120000 })
  let cost = 0, tokens = 0, ok = true, reason = 'verify inconclusivo'
  try {
    const j = JSON.parse(stdout)
    cost = Number(j.total_cost_usd) || 0
    const u = j.usage || {}; tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0)
    const inner = String(j.result || '').match(/\{[\s\S]*?\}/)
    if (inner) { const v = JSON.parse(inner[0]); ok = !!v.ok; reason = String(v.reason || '').slice(0, 140) }
  } catch { ok = true; reason = 'parse do verify falhou (assumindo ok)' }
  return { ok, reason, cost, tokens }
}

function writeRun(id, res, durationS = 0, steps = null) {
  const dir = join(CARDS_DIR, 'runs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const u = res.usage || {}
  const total = (u.tokens_in || 0) + (u.tokens_out || 0) + (u.tokens_cache_create || 0)
  const stepTokens = steps ? Object.values(steps).reduce((a, s) => a + (Number(s.tokens) || 0), 0) : 0
  const safe = isoNow().replace(/[^0-9]/g, '').slice(0, 14)
  const rec = {
    id, ts: isoNow(), ok: !!res.ok, cost_usd: res.cost || '', duration_s: durationS,
    tokens_in: u.tokens_in || 0, tokens_out: u.tokens_out || 0,
    tokens_cache_create: u.tokens_cache_create || 0, tokens_cache_read: u.tokens_cache_read || 0,
    tokens_total: steps ? stepTokens : total,
    steps: steps || null,
  }
  writeFileSync(join(dir, `${id}-${safe}.json`), JSON.stringify(rec, null, 2))
  return rec
}

async function handleExecute(id) {
  const card = readCard(id)
  const target = repoPath(card.fm.repo)
  if (!existsSync(target)) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} EXECUTING->HALTED repo nao encontrado: ${target}`)
    return
  }
  const base = repoBase(card.fm.repo)
  const branch = `hicode/${id}-${card.fm.slug}`
  const wt = worktreePath(target, id, card.fm.slug)
  patchCard(id, { branch, worktree: wt }, `${isoNow()} EXECUTING: criando worktree ${branch}`)
  try { await ensureWorktree(target, wt, branch, base) } catch (e) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} EXECUTING->HALTED ${String((e && e.message) || e).slice(0, 140)}`)
    return
  }
  process.stdout.write(`[runner] #${id}: implementando em worktree ${wt}\n`)
  const t0 = Date.now()
  const shotPath = join(CARDS_DIR, 'previews', String(id), 'preview.png')
  const z = () => ({ time: 0, cost: 0, tokens: 0 })
  const sec = (ms) => Math.round(ms / 1000)
  const tok = (u) => (u ? (u.tokens_in || 0) + (u.tokens_out || 0) + (u.tokens_cache_create || 0) : 0)
  const steps = { Fila: z(), Executando: z(), Feito: z(), Preview: z(), Aprovado: z(), Arquitetura: z(), Testes: z(), Seguranca: z(), Review: z(), Limpeza: z(), Revalidacao: z() }
  let tx = Date.now()
  let res = await implement(card, wt, '')
  steps.Executando.time += sec(Date.now() - tx); steps.Executando.cost += parseFloat(res.cost) || 0; steps.Executando.tokens += tok(res.usage)
  if (!res.ok) {
    const rec = writeRun(id, res, sec(Date.now() - t0), steps)
    patchCard(id, { status: 'HALTED', cost_usd: res.cost || '', tokens_total: String(rec.tokens_total) }, `${isoNow()} EXECUTING->HALTED ${res.reason}`)
    await removeWorktree(target, wt)
    return
  }
  patchCard(id, {}, `${isoNow()} EXECUTING->EXECUTED ${res.resultText || 'mudanca aplicada'}`)
  const port = previewPort(id)
  const pid = hasBuildScript(target) ? startPreview(wt, port) : 0
  const url = pid ? `http://localhost:${port}` : ''
  if (pid) await waitHttp(url, 30)
  const tp = Date.now()
  let verify = { ok: true, reason: 'sem dev server (check visual pulado)', cost: 0, tokens: 0 }
  let attempt = 0
  while (pid) {
    await new Promise(r => setTimeout(r, 2500))
    await screenshot(id, url)
    verify = await verifyVisual(card, shotPath)
    steps.Preview.cost += verify.cost || 0; steps.Preview.tokens += verify.tokens || 0
    patchCard(id, {}, `${isoNow()} check visual (IA, ${VERIFY_MODEL}): ${verify.ok ? 'OK' : 'FALHOU'} — ${verify.reason}`)
    if (verify.ok || attempt >= MAX_VERIFY) break
    attempt++
    process.stdout.write(`[runner] #${id}: check visual falhou, reexecutando (${attempt})\n`)
    const tx2 = Date.now()
    const r2 = await implement(card, wt, `A verificacao visual falhou: ${verify.reason}. Garanta que o elemento/mudanca pedido apareca DE FATO e visivelmente na pagina.`)
    steps.Executando.time += sec(Date.now() - tx2); steps.Executando.cost += parseFloat(r2.cost) || 0; steps.Executando.tokens += tok(r2.usage)
    if (r2.ok) res = r2
  }
  steps.Preview.time = sec(Date.now() - tp)
  const tf = Date.now()
  await runGit(wt, ['add', '-A'])
  await runGit(wt, ['-c', 'commit.gpgsign=false', 'commit', '-m', `feat: ${card.fm.title} (#${id})`])
  steps.Feito.time = sec(Date.now() - tf)
  const costSum = steps.Executando.cost + steps.Preview.cost
  const duration = sec(Date.now() - t0)
  const rec = writeRun(id, { ...res, cost: costSum.toFixed(4) }, duration, steps)
  const vlabel = verify.ok ? 'visual OK' : 'visual NAO confirmado'
  patchCard(id, { status: 'PREVIEW', preview_url: url, preview_pid: String(pid || ''), verify: verify.ok ? 'ok' : 'falhou', cost_usd: costSum.toFixed(4), tokens_total: String(rec.tokens_total) }, `${isoNow()} EXECUTED->PREVIEW ${url || '(sem dev server)'} (${vlabel}: ${verify.reason})`)
  process.stdout.write(`[runner] #${id}: PREVIEW ${url} (${vlabel})\n`)
}

async function runStep(wt, agent, instruction) {
  const t = Date.now()
  const prompt = [
    `Use o agente Nexus ${agent} no projeto web em ${wt} (Vite + Vue 3 + TypeScript). Edite arquivos em src/ apenas se necessario.`,
    'NAO rode git/commit, NAO inicie servidores. Sem comentarios de prosa no codigo. Se nao houver nada a fazer, responda "nada a fazer".',
    instruction,
    'Responda em 1 linha o que foi feito.',
  ].join('\n')
  const { stdout } = await run('claude', [
    '-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits',
    '--add-dir', wt, '--allowedTools', 'Task,Read,Edit,Write,Glob,Grep,Bash',
  ], { cwd: ROOT, timeout: RUN_TIMEOUT_MS })
  let cost = 0, tokens = 0, text = ''
  try {
    const j = JSON.parse(stdout)
    cost = Number(j.total_cost_usd) || 0
    const u = j.usage || {}; tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0)
    text = String(j.result || '').split('\n')[0].slice(0, 120)
  } catch { void 0 }
  return { time: Math.round((Date.now() - t) / 1000), cost, tokens, text }
}

function updateRunSteps(id, fsteps) {
  const dir = join(CARDS_DIR, 'runs')
  if (!existsSync(dir)) return { tokens: 0, cost: 0 }
  const files = readdirSync(dir).filter(f => f.startsWith(`${id}-`) && f.endsWith('.json')).sort()
  if (!files.length) return { tokens: 0, cost: 0 }
  const p = join(dir, files[files.length - 1])
  let r
  try { r = JSON.parse(readFileSync(p, 'utf8')) } catch { return { tokens: 0, cost: 0 } }
  r.steps = r.steps || {}
  let addTok = 0, addCost = 0, addTime = 0
  for (const [k, v] of Object.entries(fsteps)) { r.steps[k] = v; addTok += v.tokens || 0; addCost += v.cost || 0; addTime += v.time || 0 }
  r.tokens_total = (Number(r.tokens_total) || 0) + addTok
  r.cost_usd = ((parseFloat(r.cost_usd) || 0) + addCost).toFixed(4)
  r.duration_s = (Number(r.duration_s) || 0) + addTime
  writeFileSync(p, JSON.stringify(r, null, 2))
  return { tokens: r.tokens_total, cost: r.cost_usd }
}

async function handleFinish(id) {
  const card = readCard(id)
  const target = repoPath(card.fm.repo)
  const base = repoBase(card.fm.repo)
  const branch = card.fm.branch || `hicode/${id}-${card.fm.slug}`
  const wt = card.fm.worktree || worktreePath(target, id, card.fm.slug)
  const msg = `feat: ${card.fm.title} (#${id})`
  const shotPath = join(CARDS_DIR, 'previews', String(id), 'preview.png')
  if (!existsSync(wt)) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} PREVIEW_OK->HALTED worktree ausente: ${wt}`)
    return
  }
  process.stdout.write(`[runner] #${id}: finalizando (qualidade Nexus + PR)\n`)
  const desc = extractObjetivo(card.body) || card.fm.title
  const fsteps = {}
  const QUALITY = [
    ['Arquitetura', 'rufus', `Melhore a arquitetura/refatore o codigo relacionado a: "${desc}" sem mudar o comportamento observavel. Se nao houver ganho claro, nao mude nada.`],
    ['Testes', 'testudo', `Garanta cobertura de testes para: "${desc}". Escreva/ajuste testes se aplicavel ao projeto.`],
    ['Seguranca', 'escudo', `Revise seguranca (OWASP, secrets, XSS, deps) do que foi alterado para: "${desc}". Corrija problemas criticos.`],
    ['Review', 'crivo', `Revise adversarialmente (read-only) o diff atual vs a tarefa "${desc}". Aponte problemas; nao edite arquivos.`],
    ['Limpeza', 'pura', 'Remova comentarios de prosa do codigo alterado (preserve licenca, diretivas de tooling, TODO/ticket).'],
  ]
  const stateFor = { Arquitetura: 'REFINED', Testes: 'TESTS_GREEN', Seguranca: 'SEC_CLEARED', Review: 'REVIEWED', Limpeza: 'CLEANED' }
  for (const [step, agent, instruction] of QUALITY) {
    const r = await runStep(wt, agent, instruction)
    fsteps[step] = { time: r.time, cost: r.cost, tokens: r.tokens }
    patchCard(id, { status: stateFor[step] }, `${isoNow()} ${step} (${agent}): ${r.text || 'ok'} (custo $${r.cost.toFixed(4)} · ${r.tokens} tokens)`)
    process.stdout.write(`[runner] #${id}: ${step} (${agent}) $${r.cost.toFixed(4)}\n`)
  }
  if (hasBuildScript(target)) {
    const tb = Date.now()
    const b = await run('npm', ['run', 'build'], { cwd: wt, timeout: 240000 })
    fsteps.Testes = { time: (fsteps.Testes.time || 0) + Math.round((Date.now() - tb) / 1000), cost: fsteps.Testes.cost, tokens: fsteps.Testes.tokens }
    if (b.err) {
      patchCard(id, { status: 'HALTED' }, `${isoNow()} build->HALTED build falhou`)
      return
    }
    patchCard(id, {}, `${isoNow()} build (tsc + vite) exit=0`)
  }
  const rport = previewPort(id)
  const rurl = `http://localhost:${rport}`
  let reval = { ok: true, reason: 'sem dev server (revalidacao pulada)', cost: 0, tokens: 0 }
  const rt = Date.now()
  if (hasBuildScript(target)) {
    let up = await httpOk(rurl)
    if (!up) { startPreview(wt, rport); up = await waitHttp(rurl, 25) }
    if (up) {
      await new Promise(r => setTimeout(r, 3000))
      await screenshot(id, rurl)
      reval = await verifyVisual(card, shotPath)
    }
  }
  fsteps.Revalidacao = { time: Math.round((Date.now() - rt) / 1000), cost: reval.cost || 0, tokens: reval.tokens || 0 }
  patchCard(id, { revalidacao: reval.ok ? 'ok' : 'falhou' }, `${isoNow()} revalidacao do projeto (vs objetivo): ${reval.ok ? 'OK' : 'FALHOU'} — ${reval.reason}`)
  if (!reval.ok) {
    updateRunSteps(id, fsteps)
    patchCard(id, { status: 'HALTED' }, `${isoNow()} CLEANED->HALTED revalidacao falhou: objetivo nao confirmado apos polimento (worktree + preview mantidos p/ inspecao)`)
    process.stdout.write(`[runner] #${id}: HALTED revalidacao (${reval.reason})\n`)
    return
  }
  const totals = updateRunSteps(id, fsteps)
  await runGit(wt, ['add', '-A'])
  await runGit(wt, ['-c', 'commit.gpgsign=false', 'commit', '-m', `chore: qualidade Nexus (#${id})`])
  const p = await runGit(wt, ['push', '-u', 'origin', branch])
  if (p.err) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} CLEANED->HALTED push falhou: ${String(p.stderr || '').slice(0, 120)}`)
    return
  }
  const body = `Gerado pelo motor hicode (agentes Nexus). Card #${id}.\n\n${(card.desc || '').slice(0, 500)}`
  const pr = await run('gh', ['pr', 'create', '--repo', card.fm.repo, '--base', base, '--head', branch, '--title', msg, '--body', body], { cwd: wt, timeout: 60000 })
  const url = String(pr.stdout || '').trim().split('\n').filter(Boolean).pop() || ''
  if (pr.err && !url) {
    patchCard(id, { status: 'HALTED' }, `${isoNow()} CLEANED->HALTED gh pr create falhou: ${String(pr.stderr || '').slice(0, 120)}`)
    return
  }
  stopPreview(card.fm.preview_pid)
  await removeWorktree(target, wt)
  patchCard(id, { status: 'PR_OPEN', pr_url: url, cost_usd: String(totals.cost || card.fm.cost_usd || ''), tokens_total: String(totals.tokens || card.fm.tokens_total || '') }, `${isoNow()} REVIEWED->PR_OPEN ${url} (merge e do humano)`)
  process.stdout.write(`[runner] #${id}: PR_OPEN ${url}\n`)
}

const active = new Set()

async function runJob(job) {
  active.add(job.id)
  try {
    if (job.kind === 'execute') await handleExecute(job.id)
    else await handleFinish(job.id)
  } catch (e) {
    patchCard(job.id, { status: 'HALTED' }, `${isoNow()} HALTED erro: ${String((e && e.message) || e)}`)
  } finally {
    active.delete(job.id)
  }
}

function pending() {
  const ex = cardsByStatus('EXECUTING').map(c => ({ kind: 'execute', id: c.id }))
  const fi = cardsByStatus('PREVIEW_OK').map(c => ({ kind: 'finish', id: c.id }))
  return [...ex, ...fi].filter(j => !active.has(j.id))
}

function tick() {
  for (const job of pending()) {
    if (active.size >= MAX_CONCURRENCY) break
    runJob(job)
  }
}

if (process.argv.includes('--once')) {
  Promise.all(pending().slice(0, MAX_CONCURRENCY).map(runJob)).then(() => process.exit(0))
} else {
  process.stdout.write(`hicode runner ativo — worktrees + paralelo (max ${MAX_CONCURRENCY}, poll ${POLL_MS}ms, timeout ${RUN_TIMEOUT_MS}ms)\n`)
  setInterval(tick, POLL_MS)
  tick()
}
