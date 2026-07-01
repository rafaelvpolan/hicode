<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'

type Card = Record<string, any>
const state = reactive<{ repos: Card[]; cards: Card[]; statuses: string[] }>({ repos: [], cards: [], statuses: [] })
const runs = ref<Card[]>([])
const gh = ref<Card[]>([])
const repoMsg = ref('')
const sprintMsg = ref('')
const newRepo = reactive({ name: '', url: '', branch: '', runCmd: '' })
const sprintRepo = ref('')
const sprintText = ref('')
const projectPreview = reactive({ url: '', msg: '' })
const editing = reactive({ open: false, id: '', title: '', desc: '', risk: 'low', note: '' })
const chartMetric = ref('todos')
const METRICS: Record<string, any> = {
  tokens: { key: 'tokens_total', name: 'Tokens', color: '#2f81f7', fmt: (v: number) => Number(v || 0).toLocaleString('pt-BR') },
  custo: { key: 'cost_usd', name: 'Custo $', color: '#3fb950', fmt: (v: number) => '$' + Number(v || 0).toFixed(4) },
  tempo: { key: 'duration_s', name: 'Tempo (s)', color: '#d29922', fmt: (v: number) => Number(v || 0) + 's' },
}
const METRIC_LIST = ['tokens', 'custo', 'tempo', 'todos']
function setMetric(m: string) { chartMetric.value = m; renderChart() }

const PHASES: [string, string][] = [
  ['READY', 'Fila'], ['EXECUTING', 'Executando'], ['EXECUTED', 'Feito'], ['PREVIEW', 'Preview'],
  ['PREVIEW_OK', 'Aprovado'], ['REFINED', 'Arquitetura'], ['TESTS_GREEN', 'Testes'],
  ['SEC_CLEARED', 'Segurança'], ['REVIEWED', 'Review'], ['CLEANED', 'Limpeza'],
  ['PR_OPEN', 'PR'], ['MERGED', 'Merge'], ['DEPLOYED', 'Deploy'],
]
const IN_PROGRESS = ['SPECCED', 'PLAN_APPROVED', 'EXECUTING', 'EXECUTED', 'REFINED', 'TESTS_GREEN', 'SEC_CLEARED', 'REVIEWED', 'CLEANED']

const kpis = computed(() => {
  const c = state.cards
  const n = (s: string) => c.filter(x => x.status === s).length
  const tokens = runs.value.reduce((a, r) => a + (Number(r.tokens_total) || 0), 0)
  return [
    { l: 'total', v: String(c.length), k: '' },
    { l: 'na sprint', v: String(n('READY')), k: '' },
    { l: 'em andamento', v: String(c.filter(x => IN_PROGRESS.includes(x.status)).length), k: '' },
    { l: 'preview', v: String(n('PREVIEW')), k: 'warn' },
    { l: 'PR aberto', v: String(n('PR_OPEN')), k: 'warn' },
    { l: 'HALTED', v: String(n('HALTED')), k: 'bad' },
    { l: 'tokens (total)', v: tokens.toLocaleString('pt-BR'), k: 'ok' },
  ]
})

const runsByCard = computed(() => {
  const m: Record<string, { count: number; tokens: number; cost: number; time: number }> = {}
  for (const r of runs.value) {
    const id = String(r.id)
    if (!m[id]) m[id] = { count: 0, tokens: 0, cost: 0, time: 0 }
    m[id].count++
    m[id].tokens += Number(r.tokens_total) || 0
    m[id].cost += Number(r.cost_usd) || 0
    m[id].time += Number(r.duration_s) || 0
  }
  return m
})

function phaseIdx(status: string) { return PHASES.findIndex(p => p[0] === status) }
function stClass(i: number, idx: number) { return i < idx ? 'done' : i === idx ? 'now' : 'todo' }
function fmtTime(s: number) { const n = Number(s) || 0; return n >= 60 ? `${Math.floor(n / 60)}m${n % 60}s` : `${n}s` }
function fmtDt(ts: string) { try { return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) } catch { return String(ts) } }
function runsFor(id: string) { return runs.value.filter(r => String(r.id) === String(id)).sort((a, b) => String(a.ts).localeCompare(String(b.ts))) }
const STEP_LIST = [
  { k: 'Fila', l: 'Fila' }, { k: 'Executando', l: 'Executando' }, { k: 'Feito', l: 'Feito' },
  { k: 'Preview', l: 'Preview' }, { k: 'Aprovado', l: 'Aprovado' }, { k: 'Arquitetura', l: 'Arquitetura' },
  { k: 'Testes', l: 'Testes' }, { k: 'Seguranca', l: 'Segurança' }, { k: 'Review', l: 'Review' }, { k: 'Limpeza', l: 'Limpeza' },
  { k: 'Revalidacao', l: 'Revalidação' },
]

async function load() {
  const s = await $fetch<any>('/api/state')
  Object.assign(state, s)
  if (!sprintRepo.value && state.repos[0]) sprintRepo.value = state.repos[0].name
  const r = await $fetch<any>('/api/runs')
  runs.value = r.runs || []
}

async function addRepo() {
  const name = newRepo.name.trim()
  if (!name) { repoMsg.value = 'informe owner/repo'; return }
  const r = await $fetch<any>('/api/repos', { method: 'POST', body: { ...newRepo, name } }).catch((e) => e?.data || { error: 'falhou' })
  if (r.error) { repoMsg.value = r.error; return }
  newRepo.name = newRepo.url = newRepo.runCmd = newRepo.branch = ''
  repoMsg.value = 'repo adicionado'
  await load()
}
async function loadGh() {
  repoMsg.value = 'buscando via gh…'
  const r = await $fetch<any>('/api/gh-repos')
  gh.value = r.items || []
  repoMsg.value = r.error ? r.error : ''
}
async function quickAdd(name: string, url: string) {
  await $fetch('/api/repos', { method: 'POST', body: { name, url, branch: 'main' } }).catch(() => {})
  repoMsg.value = name + ' adicionado'
  await load()
}
async function createSprint() {
  let text = sprintText.value.trim()
  if (!text) { sprintMsg.value = 'escreva a feature'; return }
  const high = text.startsWith('!')
  if (high) text = text.slice(1).trim()
  const title = (text.split('\n')[0] || '').trim().slice(0, 80)
  const r = await $fetch<any>('/api/sprint', { method: 'POST', body: { repo: sprintRepo.value, features: [{ title, risk: high ? 'high' : 'low', desc: text }] } })
  sprintMsg.value = (r.created || 0) + ' card criado (texto inteiro = 1 task)'
  sprintText.value = ''
  await load()
}

async function runProjectPreview() {
  projectPreview.msg = 'iniciando…'
  try {
    const r = await $fetch<any>('/api/project-preview', { method: 'POST' })
    if (r.error) { projectPreview.msg = r.error; return }
    projectPreview.url = r.url
    projectPreview.msg = r.running ? 'já rodando' : 'iniciado (aguarde alguns segundos)'
    window.open(r.url, '_blank')
  } catch { projectPreview.msg = 'falhou ao iniciar' }
}
async function start(id: string) { await $fetch(`/api/cards/${id}/start`, { method: 'POST' }); await load() }
async function pause(id: string) { await $fetch(`/api/cards/${id}/pause`, { method: 'POST' }); await load() }
async function resume(id: string) { await $fetch(`/api/cards/${id}/resume`, { method: 'POST' }); await load() }
async function act(id: string, kind: string) { await $fetch(`/api/cards/${id}/${kind}`, { method: 'POST' }); await load() }
async function reject(id: string) {
  const reason = window.prompt('motivo da rejeição?') || ''
  await $fetch(`/api/cards/${id}/reject`, { method: 'POST', body: { reason } })
  await load()
}
async function removeCard(c: Card) {
  if (!window.confirm(`Remover o card #${c.id} "${c.title}"?\nApaga o arquivo do card.`)) return
  await $fetch(`/api/cards/${c.id}`, { method: 'DELETE' })
  await load()
}

async function openEdit(c: Card) {
  editing.id = c.id
  editing.title = c.title || ''
  editing.desc = c.desc || c.title || ''
  editing.risk = c.risk === 'high' ? 'high' : 'low'
  editing.note = ''
  if (c.status === 'EXECUTING') {
    await $fetch(`/api/cards/${c.id}/pause`, { method: 'POST' })
    editing.note = 'tarefa estava em execução — foi pausada para edição.'
    await load()
  }
  editing.open = true
}
async function saveEdit() {
  await $fetch(`/api/cards/${editing.id}/edit`, { method: 'POST', body: { title: editing.title, desc: editing.desc, risk: editing.risk } })
  editing.open = false
  await load()
}
function closeEdit() { editing.open = false }

let echartsMod: any = null
let chart: any = null
const chartEl = ref<HTMLElement | null>(null)
function escTip(s: string) { return String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] as string)) }
async function ensureChart() {
  if (!echartsMod) echartsMod = await import('echarts')
  if (!chart && chartEl.value) chart = echartsMod.init(chartEl.value, null, { renderer: 'canvas' })
}
function renderChart() {
  if (!chart) return
  const data = runs.value
  const labels = data.map(r => `#${r.id} ${String(r.ts).slice(11, 16)}`)
  const xAxis = { type: 'category', data: labels, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#30363d' } } }
  const tooltip = {
    trigger: 'axis', backgroundColor: '#161b22', borderColor: '#30363d', textStyle: { color: '#e6edf3' },
    formatter: (ps: any[]) => {
      const i = ps[0].dataIndex; const r = data[i]
      let dt = String(r.ts); try { dt = new Date(r.ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) } catch { dt = String(r.ts) }
      return `<b>#${escTip(r.id)} ${escTip(r.title)}</b><br/>${escTip(dt)}<br/>tokens: ${Number(r.tokens_total || 0).toLocaleString('pt-BR')}<br/>custo: $${Number(r.cost_usd || 0).toFixed(4)}<br/>tempo: ${Number(r.duration_s || 0)}s`
    },
  }
  if (chartMetric.value === 'todos') {
    chart.setOption({
      backgroundColor: 'transparent',
      legend: { data: ['Tokens', 'Custo $', 'Tempo (s)'], top: 0, textStyle: { color: '#8b949e' } },
      grid: { left: 58, right: 70, top: 40, bottom: 24 }, tooltip, xAxis,
      yAxis: [
        { type: 'value', name: 'tok', axisLabel: { color: '#8b949e' }, splitLine: { lineStyle: { color: '#21262d' } } },
        { type: 'value', name: '$', position: 'right', axisLabel: { color: '#8b949e' }, splitLine: { show: false } },
        { type: 'value', name: 's', position: 'right', offset: 48, axisLabel: { color: '#8b949e' }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Tokens', type: 'bar', yAxisIndex: 0, data: data.map(r => Number(r.tokens_total) || 0), itemStyle: { color: '#2f81f7' }, label: { show: true, position: 'top', color: '#e6edf3', fontSize: 9, formatter: (p: any) => p.value ? Number(p.value).toLocaleString('pt-BR') : '' } },
        { name: 'Custo $', type: 'bar', yAxisIndex: 1, data: data.map(r => Number(r.cost_usd) || 0), itemStyle: { color: '#3fb950' }, label: { show: true, position: 'top', color: '#e6edf3', fontSize: 9, formatter: (p: any) => p.value ? '$' + Number(p.value).toFixed(2) : '' } },
        { name: 'Tempo (s)', type: 'bar', yAxisIndex: 2, data: data.map(r => Number(r.duration_s) || 0), itemStyle: { color: '#d29922' }, label: { show: true, position: 'top', color: '#e6edf3', fontSize: 9, formatter: (p: any) => p.value ? p.value + 's' : '' } },
      ],
    }, true)
    return
  }
  const m = METRICS[chartMetric.value]
  const vals = data.map(r => Number(r[m.key]) || 0)
  const maxIdx = vals.indexOf(Math.max(...vals, 0))
  const bars = vals.map((v, i) => ({ value: v, itemStyle: { color: i === maxIdx && v > 0 ? '#f0a500' : m.color, borderRadius: [4, 4, 0, 0] } }))
  chart.setOption({
    backgroundColor: 'transparent', legend: { show: false },
    grid: { left: 66, right: 16, top: 24, bottom: 24 }, tooltip, xAxis,
    yAxis: { type: 'value', name: m.name, nameTextStyle: { color: '#8b949e' }, axisLabel: { color: '#8b949e' }, splitLine: { lineStyle: { color: '#21262d' } } },
    series: [{ type: 'bar', data: bars, barMaxWidth: 40, label: { show: true, position: 'top', color: '#e6edf3', fontSize: 10, formatter: (p: any) => p.value ? m.fmt(p.value) : '' } }],
  }, true)
}
const minis: Record<string, any> = {}
function renderMinis() {
  if (!echartsMod) return
  for (const c of state.cards) {
    const rs = runs.value.filter(r => String(r.id) === String(c.id))
    if (!rs.length) continue
    const el = document.getElementById('mini-' + c.id)
    if (!el) continue
    let m = minis[c.id]
    if (!m) { m = echartsMod.init(el); minis[c.id] = m }
    m.setOption({
      backgroundColor: 'transparent',
      grid: { left: 4, right: 4, top: 16, bottom: 2 },
      tooltip: { trigger: 'axis', backgroundColor: '#161b22', borderColor: '#30363d', textStyle: { color: '#e6edf3' }, formatter: (ps: any[]) => { const r = rs[ps[0].dataIndex]; return `${Number(r.tokens_total || 0).toLocaleString('pt-BR')} tok · $${Number(r.cost_usd || 0).toFixed(2)} · ${Number(r.duration_s || 0)}s` } },
      xAxis: { type: 'category', show: false, data: rs.map((_, i) => String(i)) },
      yAxis: { type: 'value', show: false },
      series: [{ type: 'bar', data: rs.map(r => Number(r.cost_usd) || 0), itemStyle: { color: '#3fb950', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 22, label: { show: true, position: 'top', color: '#8b949e', fontSize: 9, formatter: (p: any) => '$' + Number(p.value).toFixed(2) } }],
    }, true)
    m.resize()
  }
}
async function refreshChart() {
  if (!runs.value.length) return
  await nextTick()
  await ensureChart()
  if (chart) { chart.resize(); renderChart() }
  await nextTick()
  renderMinis()
}
function onResize() { chart && chart.resize() }

let timer: any = null
onMounted(async () => {
  await load()
  timer = setInterval(load, 4000)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('resize', onResize)
  if (chart) chart.dispose()
})
</script>

<template>
  <header class="nav">
    <div class="wrap navwrap">
      <span class="brand"><span class="logo">⟳</span> hicode</span>
      <span class="tag">painel · Nuxt 4 + Bun · executar → preview → aprovar → PR</span>
      <span class="navbtns">
        <button @click="runProjectPreview" title="Sobe o dev server do projeto e abre para ver as alterações em tempo real">▶ preview do projeto</button>
        <button class="ghost" @click="load">↻ atualizar</button>
      </span>
    </div>
  </header>

  <main class="wrap">
    <section class="card-sec">
      <h2>Visão geral</h2>
      <div class="kpis">
        <div v-for="k in kpis" :key="k.l" class="kpi" :class="k.k"><b>{{ k.v }}</b><span>{{ k.l }}</span></div>
      </div>
    </section>

    <div class="grid2">
      <section class="card-sec">
        <h2>Repositórios</h2>
        <div v-if="projectPreview.url || projectPreview.msg" class="msg ok">preview do projeto: <a v-if="projectPreview.url" :href="projectPreview.url" target="_blank" rel="noopener">{{ projectPreview.url }}</a> {{ projectPreview.msg }}</div>
        <div class="repolist">
          <div v-if="!state.repos.length" class="empty">nenhum repo — adicione ou busque do GitHub.</div>
          <div v-for="r in state.repos" :key="r.name" class="item"><span class="nm">{{ r.name }}</span><span class="meta">{{ r.branch || 'main' }} · {{ r.runCmd || 'sem run' }}</span></div>
        </div>
        <div class="row">
          <div><label>Nome (owner/repo)</label><input v-model="newRepo.name" placeholder="rafaelvpolan/hicode-site"></div>
          <div><label>Branch</label><input v-model="newRepo.branch" placeholder="main"></div>
        </div>
        <div class="row">
          <div><label>Git URL</label><input v-model="newRepo.url"></div>
          <div><label>Run (preview)</label><input v-model="newRepo.runCmd" placeholder="npm run dev"></div>
        </div>
        <div class="row mt"><button @click="addRepo">+ adicionar</button><button class="ghost" @click="loadGh">buscar do GitHub</button></div>
        <div class="msg">{{ repoMsg }}</div>
        <div class="ghlist">
          <div v-for="it in gh" :key="it.nameWithOwner" class="item"><span class="nm">{{ it.nameWithOwner }}</span><span class="meta">{{ it.visibility || '' }}</span><span class="sp"><button class="ghost sm" @click="quickAdd(it.nameWithOwner, it.url || '')">adicionar</button></span></div>
        </div>
      </section>

      <section class="card-sec">
        <h2>Sprint — feature</h2>
        <label>Repositório</label>
        <select v-model="sprintRepo"><option v-if="!state.repos.length" value="">(adicione um repo)</option><option v-for="r in state.repos" :key="r.name" :value="r.name">{{ r.name }}</option></select>
        <label>Feature — <strong>todo o texto vira UM card</strong> (1ª linha = título · <code>!</code> = risco alto)</label>
        <textarea v-model="sprintText" placeholder="Altere o título do hero para:&#10;Prompts resolvem tarefas.&#10;Loops inteligentes constroem sistemas."></textarea>
        <div class="row mt"><button @click="createSprint">criar card da sprint</button></div>
        <div class="msg">{{ sprintMsg }}</div>
      </section>
    </div>

    <section class="card-sec">
      <h2>Execução — fases de cada card</h2>
      <div v-if="!state.cards.length" class="empty">nenhum card — crie features na sprint acima.</div>
      <div v-for="c in state.cards" :key="c.id" class="erow" :class="{ high: c.risk === 'high' }">
        <div class="ehead">
          <span class="eid">#{{ c.id }}</span>
          <span class="etitle">{{ c.title }}</span>
          <span v-if="c.verify" class="vbadge" :class="c.verify" :title="'Check visual da IA'">{{ c.verify === 'ok' ? '✓ visual' : '⚠ visual' }}</span>
          <span v-if="c.revalidacao" class="vbadge" :class="c.revalidacao" :title="'Revalidação do projeto vs objetivo da tarefa'">{{ c.revalidacao === 'ok' ? '✓ reval' : '⚠ reval' }}</span>
          <span class="erepo">{{ c.repo || '—' }} · {{ c.risk }}<template v-if="c.cost_usd"> · ${{ c.cost_usd }}</template><template v-if="c.tokens_total"> · {{ Number(c.tokens_total).toLocaleString('pt-BR') }} tok</template></span>
          <span class="etools"><button class="icon" title="Editar tarefa" @click="openEdit(c)">✏️</button><button class="icon del" title="Remover" @click="removeCard(c)">🗑</button></span>
        </div>
        <div v-if="c.desc && c.desc !== c.title" class="edesc">{{ c.desc }}</div>

        <div v-if="c.status === 'HALTED'" class="halt">⛔ HALTED — precisa de você</div>
        <div v-else-if="c.status === 'PAUSED'" class="paused">⏸ pausado — clique Retomar</div>
        <div v-else class="stepper">
          <span v-for="(p, i) in PHASES" :key="p[0]" class="st" :class="stClass(i, phaseIdx(c.status))"><i></i><b>{{ p[1] }}</b></span>
        </div>

        <div class="erow-actions">
          <button v-if="['INBOX', 'READY'].includes(c.status)" @click="start(c.id)">▶ Começar</button>
          <template v-else-if="c.status === 'EXECUTING'"><span class="run">⏳ executando…</span><button class="ghost" @click="pause(c.id)">⏸ Pausar</button></template>
          <template v-else-if="c.status === 'PAUSED'"><span class="run">⏸ pausado</span><button @click="resume(c.id)">▶ Retomar</button></template>
          <template v-else-if="c.status === 'PREVIEW'"><button @click="act(c.id, 'approve')">✅ Aprovar</button><button class="ghost" @click="reject(c.id)">✋ Rejeitar</button></template>
          <a v-else-if="c.status === 'PR_OPEN' && c.pr_url" class="btnlink" :href="c.pr_url" target="_blank" rel="noopener">🔗 Abrir PR</a>
          <a v-if="['PREVIEW', 'PREVIEW_OK'].includes(c.status) && c.preview_url" class="prevlink" :href="c.preview_url" target="_blank" rel="noopener">abrir preview ↗</a>
        </div>
        <a v-if="c.status === 'PREVIEW' && c.shot" :href="c.preview_url || '#'" target="_blank" rel="noopener"><img class="shot" :src="`/api/preview/${c.id}`" alt="preview"></a>
        <div v-if="runsFor(c.id).length" class="execs">
          <div class="execlbl">execuções ({{ runsFor(c.id).length }})</div>
          <div v-for="(r, i) in runsFor(c.id)" :key="i" class="exec">
            <div class="exectop">#{{ i + 1 }} · {{ fmtDt(r.ts) }}</div>
            <table v-if="r.steps" class="steptab">
              <thead><tr><th>step</th><th>tempo</th><th>valor</th><th>tokens</th></tr></thead>
              <tbody>
                <tr v-for="st in STEP_LIST" :key="st.k">
                  <td class="sname">{{ st.l }}</td>
                  <td>{{ fmtTime(r.steps[st.k]?.time) }}</td>
                  <td>${{ Number(r.steps[st.k]?.cost || 0).toFixed(4) }}</td>
                  <td>{{ Number(r.steps[st.k]?.tokens || 0).toLocaleString('pt-BR') }}</td>
                </tr>
              </tbody>
            </table>
            <div class="execlbl">global (consolidado)</div>
            <div class="stats">
              <div class="stat t"><b>{{ fmtTime(r.duration_s) }}</b><span>tempo</span></div>
              <div class="stat c"><b>${{ Number(r.cost_usd || 0).toFixed(4) }}</b><span>valor</span></div>
              <div class="stat k"><b>{{ Number(r.tokens_total || 0).toLocaleString('pt-BR') }}</b><span>tokens</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <div v-if="editing.open" class="modal-overlay" @click.self="closeEdit">
    <div class="modal">
      <h3>Editar tarefa #{{ editing.id }}</h3>
      <label>Título</label>
      <input v-model="editing.title">
      <label>Task / descrição (texto inteiro)</label>
      <textarea v-model="editing.desc" rows="8"></textarea>
      <label>Risco</label>
      <select v-model="editing.risk"><option value="low">low</option><option value="high">high</option></select>
      <div v-if="editing.note" class="msg ok">{{ editing.note }}</div>
      <div class="modal-actions"><button @click="saveEdit">Salvar</button><button class="ghost" @click="closeEdit">Cancelar</button></div>
    </div>
  </div>
</template>

<style>
:root{ --bg:#0d1117; --panel:#161b22; --panel2:#1c2128; --bd:#30363d; --tx:#e6edf3; --mut:#8b949e; --acc:#2f81f7; --ok:#3fb950; --warn:#d29922; --bad:#f85149; --gold:#d29922; }
*{ box-sizing:border-box }
body{ margin:0; background:var(--bg); color:var(--tx); font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif }
a{ color:var(--acc); text-decoration:none } a:hover{ text-decoration:underline }
</style>

<style scoped>
.wrap{ max-width:1180px; margin:0 auto; padding:0 20px; width:100% }
.nav{ position:sticky; top:0; z-index:20; background:rgba(13,17,23,.85); backdrop-filter:blur(8px); border-bottom:1px solid var(--bd) }
.navwrap{ display:flex; align-items:center; gap:12px; height:58px }
.brand{ font-weight:700; font-size:17px } .logo{ color:var(--acc) }
.tag{ color:var(--mut); font-size:12px } .navbtns{ margin-left:auto; display:flex; gap:8px }
main{ padding:20px 20px 60px; display:grid; gap:18px }
.grid2{ display:grid; grid-template-columns:1fr 1fr; gap:18px }
@media(max-width:860px){ .grid2{ grid-template-columns:1fr } }
.card-sec{ background:var(--panel); border:1px solid var(--bd); border-radius:10px; padding:16px }
.card-sec h2{ font-size:13px; text-transform:uppercase; letter-spacing:.04em; color:var(--mut); margin:0 0 12px }
label{ display:block; font-size:12px; color:var(--mut); margin:8px 0 3px }
input,textarea,select,button{ font:inherit; color:var(--tx); background:var(--panel2); border:1px solid var(--bd); border-radius:7px; padding:7px 10px }
input,textarea,select{ width:100% } textarea{ min-height:88px; resize:vertical }
button{ background:var(--acc); border-color:var(--acc); color:#fff; cursor:pointer; font-weight:600 }
button.ghost{ background:var(--panel2); border-color:var(--bd); color:var(--tx); font-weight:500 }
button.sm{ padding:4px 10px; font-size:12px }
.row{ display:flex; gap:8px; flex-wrap:wrap } .row.mt{ margin-top:10px } .row>div{ flex:1; min-width:120px }
.repolist,.ghlist{ display:flex; flex-direction:column; gap:6px; margin:8px 0; max-height:240px; overflow:auto }
.item{ display:flex; gap:10px; align-items:center; padding:8px 10px; background:var(--panel2); border:1px solid var(--bd); border-radius:7px }
.item .nm{ font-weight:600 } .item .meta{ color:var(--mut); font-size:12px } .item .sp{ margin-left:auto }
.kpis{ display:flex; gap:10px; flex-wrap:wrap }
.kpi{ flex:1; min-width:96px; background:var(--panel2); border:1px solid var(--bd); border-radius:9px; padding:10px 12px }
.kpi b{ display:block; font-size:20px } .kpi span{ color:var(--mut); font-size:11px; text-transform:uppercase }
.kpi.warn b{ color:var(--warn) } .kpi.bad b{ color:var(--bad) } .kpi.ok b{ color:var(--ok) }
.chart{ width:100%; height:320px }
.chartbar{ display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap }
.fbtn{ background:var(--panel2); border:1px solid var(--bd); color:var(--mut); padding:5px 12px; border-radius:7px; font-size:12px; cursor:pointer; font-weight:600 }
.fbtn.on{ background:var(--acc); border-color:var(--acc); color:#fff }
.msg{ font-size:12px; min-height:16px; margin-top:8px; color:var(--mut) } .msg.ok{ color:var(--ok) }
.empty{ color:var(--mut); font-size:13px; padding:6px 2px }
.erow{ background:var(--panel2); border:1px solid var(--bd); border-left:3px solid var(--acc); border-radius:9px; padding:12px 14px; margin-bottom:10px }
.erow.high{ border-left-color:var(--warn) }
.ehead{ display:flex; gap:10px; align-items:baseline; flex-wrap:wrap }
.eid{ color:var(--mut); font-weight:700 } .etitle{ font-weight:600 }
.erepo{ color:var(--mut); font-size:12px; margin-left:auto }
.etools{ display:flex; gap:4px }
button.icon{ background:transparent; border:1px solid var(--bd); color:var(--mut); padding:2px 8px; border-radius:6px; font-size:12px; font-weight:500 }
button.icon:hover{ border-color:var(--acc); color:var(--tx) } button.icon.del:hover{ border-color:var(--bad); color:var(--bad) }
.vbadge{ font-size:11px; padding:1px 7px; border-radius:6px; border:1px solid var(--bd); font-weight:600 }
.vbadge.ok{ color:var(--ok); border-color:color-mix(in srgb,var(--ok) 45%,transparent) }
.vbadge.falhou{ color:var(--warn); border-color:color-mix(in srgb,var(--warn) 45%,transparent) }
.edesc{ white-space:pre-wrap; color:var(--mut); font-size:13px; margin:8px 0 2px; border-left:2px solid var(--bd); padding-left:10px }
.stepper{ display:flex; gap:10px; flex-wrap:wrap; margin:11px 0 4px }
.st{ display:flex; align-items:center; gap:5px; font-size:11px }
.st i{ width:9px; height:9px; border-radius:50%; background:var(--bd); display:inline-block; flex:0 0 auto }
.st.done i{ background:var(--ok) } .st.done b{ color:var(--mut); font-weight:500 }
.st.now i{ background:var(--acc); box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 30%,transparent) } .st.now b{ color:var(--tx) }
.st.todo b{ color:#566 } .st.todo i{ opacity:.5 } .st b{ font-weight:600 }
.erow-actions{ display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap }
.erow-actions button{ padding:6px 12px; font-size:13px }
.run{ color:var(--acc); font-size:13px; font-weight:600 }
.btnlink{ background:var(--acc); border:1px solid var(--acc); color:#fff; padding:6px 12px; border-radius:8px; font-weight:600; font-size:13px }
.btnlink:hover{ text-decoration:none }
.prevlink{ font-size:12px } .halt{ color:var(--bad); font-weight:600; margin:8px 0 } .paused{ color:var(--gold); font-weight:600; margin:8px 0 }
.shot{ max-width:440px; width:100%; border-radius:6px; border:1px solid var(--bd); margin-top:8px; display:block }
.ecount{ margin-top:8px; padding-top:7px; border-top:1px solid var(--bd); color:var(--mut); font-size:12px }
.minilbl{ font-size:10px; color:var(--mut); margin-top:6px; text-transform:uppercase; letter-spacing:.03em }
.minichart{ width:100%; max-width:300px; height:64px }
.execs{ margin-top:10px; padding-top:8px; border-top:1px solid var(--bd); display:flex; flex-direction:column; gap:8px }
.execlbl{ font-size:10px; color:var(--mut); text-transform:uppercase; letter-spacing:.03em }
.exec{ background:var(--bg); border:1px solid var(--bd); border-radius:8px; padding:8px 10px }
.exectop{ font-size:11px; color:var(--mut); margin-bottom:6px }
.stats{ display:flex; gap:8px; flex-wrap:wrap }
.stat{ flex:1; min-width:74px; background:var(--panel); border:1px solid var(--bd); border-radius:7px; padding:7px 6px; text-align:center }
.stat b{ display:block; font-size:15px; color:var(--tx); line-height:1.2 }
.stat span{ font-size:10px; color:var(--mut); text-transform:uppercase; letter-spacing:.03em }
.stat.t b{ color:var(--gold) } .stat.c b{ color:var(--ok) } .stat.k b{ color:var(--acc) }
.steptab{ width:100%; border-collapse:collapse; margin:4px 0 8px; font-size:12px }
.steptab th{ text-align:right; color:var(--mut); font-weight:600; font-size:10px; text-transform:uppercase; padding:2px 6px; border-bottom:1px solid var(--bd) }
.steptab th:first-child{ text-align:left }
.steptab td{ text-align:right; padding:3px 6px; color:var(--tx); border-bottom:1px solid color-mix(in srgb,var(--bd) 50%,transparent) }
.steptab td.sname{ text-align:left; color:var(--mut) }
.steptab tr:last-child td{ border-bottom:none }
.modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px }
.modal{ background:var(--panel); border:1px solid var(--bd); border-radius:12px; padding:20px; width:100%; max-width:560px; max-height:90vh; overflow:auto }
.modal h3{ margin:0 0 12px } .modal-actions{ display:flex; gap:8px; margin-top:14px }
</style>
