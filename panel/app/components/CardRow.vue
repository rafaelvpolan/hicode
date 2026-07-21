<script setup lang="ts">
import type { CardView, RunView } from '#shared/types'
import { ACTIVE_STATUSES, STEP_LIST } from '../composables/usePhases'
import { fmtDt, fmtTime, runsFor } from '../composables/useFormat'
import { useCardLog } from '../composables/useCardLog'
import { useCardAttempts } from '../composables/useCardAttempts'
import { useStepTiming } from '../composables/useStepTiming'
import { useAiActivity } from '../composables/useAiActivity'

interface CardRowProps {
  card: CardView
  runs: RunView[]
  estimates: Record<string, number>
}

interface CardRowEmits {
  start: [id: string]
  pause: [id: string]
  resume: [id: string]
  resolve: [id: string]
  approve: [id: string]
  reject: [id: string]
  edit: [card: CardView]
  remove: [card: CardView]
  replay: [step: string]
  review: [id: string]
  preview: [id: string]
  reset: [id: string]
  clarify: [id: string, answers: { q: string; answer: string }[]]
}

const props = defineProps<CardRowProps>()
defineEmits<CardRowEmits>()

const REVIEWABLE_STATUSES: CardView['status'][] = [
  'PREVIEW', 'CORRECTING', 'PREVIEW_OK', 'REFINED', 'TESTS_GREEN',
  'SEC_CLEARED', 'REVIEWED', 'CLEANED', 'PR_OPEN', 'MERGED',
]

const cardRuns = computed(() => runsFor(props.runs, props.card.id))
const latestRun = computed(() => cardRuns.value[cardRuns.value.length - 1] ?? null)
const showAllRuns = ref(false)
const isReviewable = computed(() => REVIEWABLE_STATUSES.includes(props.card.status))
const isPreviewable = computed(() => props.card.shot || !!props.card.preview_url)

const cardIdRef = computed(() => props.card.id)
const cardStatusRef = computed(() => props.card.status)
const estimatesRef = computed(() => props.estimates)

const { open: logOpen, source: logSource, text: logText, isPolling: logIsPolling, toggle: toggleLog, selectSource: selectLogSource } = useCardLog(cardIdRef, cardStatusRef)
const cardUpdatedRef = computed(() => props.card.updated)
const { open: attemptsOpen, attempts: attemptsList, toggle: toggleAttempts } = useCardAttempts(cardIdRef, cardUpdatedRef)
const stepTiming = useStepTiming(toRef(props, 'card'), latestRun, cardRuns, estimatesRef)
const { currentAction: aiCurrentAction, isWorking: aiIsWorking } = useAiActivity(logText)

const isCardWorking = computed(() => ACTIVE_STATUSES.includes(props.card.status))

const logPreEl = ref<HTMLPreElement | null>(null)
watch(logText, async () => {
  await nextTick()
  if (logPreEl.value) logPreEl.value.scrollTop = logPreEl.value.scrollHeight
})

function attemptKindLabel(kind: string): string {
  return kind === 'reprovacao' ? 'reprovação' : 'correção'
}

function evalBadgeClass(score: string): 'ok' | 'warn' | 'bad' {
  const n = Number(score)
  if (n >= 4) return 'ok'
  if (n === 3) return 'warn'
  return 'bad'
}
</script>

<template>
  <div class="erow" :class="{ high: card.risk === 'high' }">
    <div class="ehead">
      <span class="eid">#{{ card.id }}</span>
      <span class="etitle">{{ card.title }}</span>
      <span v-if="card.surface === 'none'" class="vbadge nonvis" title="Classificação prévia: tarefa não-visual — preview/screenshot pulado">↷ não-visual</span>
      <span v-if="card.verify && card.verify !== 'n/a'" class="vbadge" :class="card.verify" :title="'Estado do preview — você confere abrindo o link'">{{ card.verify === 'ok' ? '✓ preview' : (card.verify === 'inconclusivo' ? '◔ preview' : '⚠ preview') }}</span>
      <span v-if="card.revalidacao" class="vbadge" :class="card.revalidacao" :title="'Revalidação do projeto vs objetivo da tarefa'">{{ card.revalidacao === 'ok' ? '✓ reval' : '⚠ reval' }}</span>
      <span v-if="card.eval_score" class="vbadge" :class="evalBadgeClass(card.eval_score)" :title="card.eval_notes">★ {{ card.eval_score }}/5</span>
      <span v-if="isCardWorking" class="iaworking" role="status" aria-live="polite"><i class="iadot"></i>IA trabalhando…</span>
      <span class="erepo">{{ card.repo || '—' }} · {{ card.risk }}<template v-if="card.cost_usd"> · ${{ card.cost_usd }}</template><template v-if="card.tokens_total"> · {{ Number(card.tokens_total).toLocaleString('pt-BR') }} tok</template></span>
      <span class="etools"><button class="icon" title="Editar tarefa" @click="$emit('edit', card)">✏️</button><button class="icon del" title="Remover" @click="$emit('remove', card)">🗑</button></span>
    </div>
    <div v-if="card.desc && card.desc !== card.title" class="edesc">{{ card.desc }}</div>

    <div v-if="card.status === 'HALTED'" class="halt">
      <div class="halt-head">⛔ HALTED — parou e precisa de você</div>
      <div v-if="card.halt_reason" class="halt-reason"><b>Motivo:</b> {{ card.halt_reason }}</div>
      <div class="halt-actions">
        <button class="resolve" @click="$emit('resolve', card.id)">↻ Resolver e retomar</button>
      </div>
    </div>
    <div v-else-if="card.status === 'PAUSED'" class="paused">⏸ pausado — clique Retomar</div>
    <CardClarify
      v-else-if="card.status === 'CLARIFY'"
      :card="card"
      @answered="(answers) => $emit('clarify', card.id, answers)"
    />
    <template v-else>
      <div v-if="card.status === 'CORRECTING'" class="correcting" role="status" aria-live="polite">
        <i class="iadot"></i>✋ corrigindo — a IA está refazendo o preview…
      </div>
      <div class="stepper">
        <span v-for="s in stepTiming" :key="s.status" class="st" :class="s.cls">
          <span class="sttop">
            <i></i><b>{{ s.label }}</b>
            <button
              v-if="s.resumeStep"
              class="replay"
              type="button"
              title="rodar a partir daqui"
              @click="$emit('replay', s.resumeStep as string)"
            >▶</button>
          </span>
          <span v-if="s.elapsedLabel || s.estimateLabel" class="stmeta">
            <template v-if="s.elapsedLabel">{{ s.elapsedLabel }}</template><template v-if="s.elapsedLabel && s.estimateLabel"> · </template><template v-if="s.estimateLabel">{{ s.estimateLabel }}</template>
          </span>
        </span>
      </div>
    </template>

    <div class="erow-actions">
      <a v-if="['PREVIEW', 'PREVIEW_OK'].includes(card.status) && card.preview_url" class="prevlink" :href="card.preview_url" target="_blank" rel="noopener">▶ abrir preview ao vivo ↗</a>
      <button v-if="['INBOX', 'READY'].includes(card.status)" @click="$emit('start', card.id)">▶ Começar</button>
      <template v-else-if="card.status === 'EXECUTING'"><span class="run">⏳ executando…</span><button class="ghost" @click="$emit('pause', card.id)">⏸ Pausar</button></template>
      <template v-else-if="card.status === 'PAUSED'"><span class="run">⏸ pausado</span><button @click="$emit('resume', card.id)">▶ Retomar</button></template>
      <template v-else-if="card.status === 'PREVIEW'">
        <button @click="$emit('approve', card.id)">✅ Aprovar</button>
        <button class="ghost" @click="$emit('reject', card.id)">✋ Rejeitar</button>
        <button v-if="card.preview_url" class="ghost" @click="$emit('reset', card.id)">🔄 resetar</button>
      </template>
      <a v-else-if="card.status === 'PR_OPEN' && card.pr_url" class="btnlink" :href="card.pr_url" target="_blank" rel="noopener">🔗 Abrir PR</a>
      <button v-if="isPreviewable" class="ghost" @click="$emit('preview', card.id)">👁 Preview</button>
      <button v-if="isReviewable" class="ghost" @click="$emit('review', card.id)">🔍 Code-review</button>
    </div>

    <div class="activity">
      <button class="exectoggle" type="button" @click="toggleLog">
        <span class="chev">{{ logOpen ? '▾' : '▸' }}</span>
        📡 log ao vivo<span v-if="logIsPolling" class="livedot"> · ao vivo</span>
      </button>
      <template v-if="logOpen">
        <div class="logtabs" role="tablist">
          <button type="button" class="logtab" :class="{ active: logSource === 'ia' }" role="tab" :aria-selected="logSource === 'ia'" @click="selectLogSource('ia')">IA ao vivo</button>
          <button type="button" class="logtab" :class="{ active: logSource === 'estado' }" role="tab" :aria-selected="logSource === 'estado'" @click="selectLogSource('estado')">estado</button>
        </div>
        <div
          v-if="logSource === 'ia' && aiCurrentAction"
          class="nowline"
          :class="[aiCurrentAction.kind, { working: aiIsWorking }]"
          role="status"
          aria-live="polite"
        >{{ aiCurrentAction.text }}</div>
        <pre ref="logPreEl" class="logbox" :class="{ ailog: logSource === 'ia' }">{{ logText || 'carregando…' }}</pre>
      </template>

      <template v-if="attemptsList.length">
        <button class="exectoggle" type="button" @click="toggleAttempts">
          <span class="chev">{{ attemptsOpen ? '▾' : '▸' }}</span>
          🗂 tentativas ({{ attemptsList.length }})
        </button>
        <div v-if="attemptsOpen" class="attempts">
          <div v-for="(a, i) in attemptsList" :key="i" class="attempt">
            <div class="attempttop">
              <span class="abadge" :class="a.kind">{{ attemptKindLabel(a.kind) }}</span>
              <span class="ats">{{ fmtDt(a.ts) }}</span>
            </div>
            <div class="areason"><b>motivo:</b> {{ a.reason || '—' }}</div>
            <pre class="aresponse">{{ a.response || '—' }}</pre>
          </div>
        </div>
      </template>
    </div>

    <div v-if="cardRuns.length" class="execs">
      <button class="exectoggle" type="button" @click="showAllRuns = !showAllRuns">
        <span class="chev">{{ showAllRuns ? '▾' : '▸' }}</span>
        gasto de tokens · {{ cardRuns.length }} execuç{{ cardRuns.length === 1 ? 'ão' : 'ões' }}
      </button>

      <div v-if="!showAllRuns && latestRun" class="exec">
        <div class="exectop">execução atual · {{ fmtDt(latestRun.ts) }}</div>
        <div class="stats">
          <div class="stat t"><b>{{ fmtTime(latestRun.duration_s) }}</b><span>tempo</span></div>
          <div class="stat c"><b>${{ Number(latestRun.cost_usd || 0).toFixed(4) }}</b><span>valor</span></div>
          <div class="stat k"><b>{{ Number(latestRun.tokens_total || 0).toLocaleString('pt-BR') }}</b><span>tokens</span></div>
        </div>
      </div>

      <div v-for="(r, i) in (showAllRuns ? cardRuns : [])" :key="i" class="exec">
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
</template>

<style scoped>
.erow{ background:var(--panel2); border:1px solid var(--bd); border-left:3px solid var(--acc); border-radius:9px; padding:12px 14px; margin-bottom:10px }
.erow.high{ border-left-color:var(--warn) }
.ehead{ display:flex; gap:10px; align-items:baseline; flex-wrap:wrap }
.eid{ color:var(--mut); font-weight:700 } .etitle{ font-weight:600 }
.erepo{ color:var(--mut); font-size:12px; margin-left:auto }
.etools{ display:flex; gap:4px }
button{ font:inherit; color:var(--tx); background:var(--panel2); border:1px solid var(--bd); border-radius:7px; padding:7px 10px; cursor:pointer; font-weight:600 }
button.icon{ background:transparent; border:1px solid var(--bd); color:var(--mut); padding:2px 8px; border-radius:6px; font-size:12px; font-weight:500 }
button.icon:hover{ border-color:var(--acc); color:var(--tx) } button.icon.del:hover{ border-color:var(--bad); color:var(--bad) }
.vbadge{ font-size:11px; padding:1px 7px; border-radius:6px; border:1px solid var(--bd); font-weight:600 }
.vbadge.ok{ color:var(--ok); border-color:color-mix(in srgb,var(--ok) 45%,transparent) }
.vbadge.falhou{ color:var(--warn); border-color:color-mix(in srgb,var(--warn) 45%,transparent) }
.vbadge.inconclusivo{ color:var(--mut); border-color:color-mix(in srgb,var(--mut) 45%,transparent) }
.vbadge.nonvis{ color:var(--mut) }
.vbadge.warn{ color:var(--warn); border-color:color-mix(in srgb,var(--warn) 45%,transparent) }
.vbadge.bad{ color:var(--bad); border-color:color-mix(in srgb,var(--bad) 45%,transparent) }
.iaworking{ display:inline-flex; align-items:center; gap:6px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px; font-weight:700; color:var(--acc); letter-spacing:.02em }
.iadot{ width:8px; height:8px; border-radius:50%; background:var(--acc); display:inline-block; flex:0 0 auto }
@media (prefers-reduced-motion: no-preference){
  .iadot{ animation:iapulse 1.2s ease-in-out infinite }
  .nowline.working{ animation:nowpulse 1.6s ease-in-out infinite }
}
@keyframes iapulse{
  0%, 100%{ opacity:1; box-shadow:0 0 0 0 color-mix(in srgb,var(--acc) 50%,transparent) }
  50%{ opacity:.55; box-shadow:0 0 0 5px color-mix(in srgb,var(--acc) 0%,transparent) }
}
@keyframes nowpulse{ 0%, 100%{ opacity:1 } 50%{ opacity:.72 } }
.edesc{ white-space:pre-wrap; color:var(--mut); font-size:13px; margin:8px 0 2px; border-left:2px solid var(--bd); padding-left:10px }
.stepper{ display:flex; gap:10px; flex-wrap:wrap; margin:11px 0 4px }
.st{ display:flex; flex-direction:column; gap:2px; font-size:11px }
.sttop{ display:flex; align-items:center; gap:5px }
.st i{ width:9px; height:9px; border-radius:50%; background:var(--bd); display:inline-block; flex:0 0 auto }
.st.done i{ background:var(--ok) } .st.done b{ color:var(--mut); font-weight:500 }
.st.now i{ background:var(--acc); box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 30%,transparent) } .st.now b{ color:var(--tx) }
.st.todo b{ color:#566 } .st.todo i{ opacity:.5 } .st b{ font-weight:600 }
.st .replay{ opacity:0; width:auto; font-size:10px; line-height:1; padding:1px 5px; margin:0; border:1px solid var(--bd); border-radius:5px; background:var(--panel2); color:var(--acc); cursor:pointer; transition:opacity .12s }
.st:hover .replay{ opacity:1 }
.st .replay:hover{ border-color:var(--acc) }
.stmeta{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:9px; color:var(--mut); padding-left:14px }
.erow-actions{ display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap }
.erow-actions button{ padding:6px 12px; font-size:13px }
.erow-actions button.ghost{ background:var(--panel2); border-color:var(--bd); color:var(--tx); font-weight:500 }
.run{ color:var(--acc); font-size:13px; font-weight:600 }
.btnlink{ background:var(--acc); border:1px solid var(--acc); color:#fff; padding:6px 12px; border-radius:8px; font-weight:600; font-size:13px }
.btnlink:hover{ text-decoration:none }
.prevlink{ background:var(--acc); border:1px solid var(--acc); color:#fff; padding:6px 12px; border-radius:8px; font-weight:700; font-size:13px }
.prevlink:hover{ text-decoration:none; filter:brightness(1.08) }
.paused{ color:var(--gold); font-weight:600; margin:8px 0 }
.correcting{ display:flex; align-items:center; gap:8px; color:var(--acc); font-weight:600; margin:8px 0 }
.halt{ margin:8px 0; padding:10px 12px; border:1px solid color-mix(in srgb,var(--bad) 45%,transparent); border-radius:8px; background:color-mix(in srgb,var(--bad) 8%,transparent) }
.halt-head{ color:var(--bad); font-weight:700 }
.halt-reason{ color:var(--tx); font-size:13px; margin-top:6px; word-break:break-word }
.halt-reason b{ color:var(--mut); font-weight:600 }
.halt-actions{ display:flex; gap:8px; margin-top:10px; flex-wrap:wrap }
.halt-actions button{ padding:6px 12px; font-size:13px }
.halt-actions .resolve{ background:var(--bad); border-color:var(--bad); color:#fff }
.halt-actions .resolve:hover{ filter:brightness(1.08) }
.activity{ margin-top:10px; padding-top:8px; border-top:1px solid var(--bd); display:flex; flex-direction:column; gap:8px }
.livedot{ color:var(--ok); text-transform:none; letter-spacing:0; font-weight:600 }
.logtabs{ display:flex; gap:6px }
.logtab{ padding:3px 9px; font-size:11px; font-weight:600; border-radius:6px; background:transparent; border:1px solid var(--bd); color:var(--mut) }
.logtab.active{ color:var(--tx); border-color:var(--acc); background:color-mix(in srgb,var(--acc) 12%,transparent) }
.nowline{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12px; font-weight:600; padding:6px 10px; border-radius:7px; color:var(--tx); background:color-mix(in srgb,var(--acc) 12%,transparent); border:1px solid color-mix(in srgb,var(--acc) 35%,transparent); word-break:break-word }
.nowline.tool{ color:var(--acc) }
.nowline.done{ color:var(--ok); background:color-mix(in srgb,var(--ok) 12%,transparent); border-color:color-mix(in srgb,var(--ok) 35%,transparent) }
.logbox{ margin:0; padding:8px 10px; background:var(--bg); border:1px solid var(--bd); border-radius:7px; font-size:11px; color:var(--mut); white-space:pre-wrap; word-break:break-word; max-height:240px; overflow:auto }
.logbox.ailog{ max-height:280px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace }
.attempts{ display:flex; flex-direction:column; gap:8px }
.attempt{ background:var(--bg); border:1px solid var(--bd); border-radius:8px; padding:8px 10px }
.attempttop{ display:flex; align-items:center; gap:8px; margin-bottom:6px }
.abadge{ font-size:11px; padding:1px 7px; border-radius:6px; border:1px solid var(--bd); font-weight:600 }
.abadge.reprovacao{ color:var(--warn); border-color:color-mix(in srgb,var(--warn) 45%,transparent) }
.abadge.correcao{ color:var(--mut); border-color:color-mix(in srgb,var(--mut) 45%,transparent) }
.ats{ color:var(--mut); font-size:11px }
.areason{ color:var(--tx); font-size:13px; margin-bottom:6px; word-break:break-word }
.areason b{ color:var(--mut); font-weight:600 }
.aresponse{ margin:0; padding:8px 10px; background:var(--panel); border:1px solid var(--bd); border-radius:7px; font-size:12px; font-family:inherit; color:var(--tx); white-space:pre-wrap; word-break:break-word; max-height:280px; overflow:auto }
.execs{ margin-top:10px; padding-top:8px; border-top:1px solid var(--bd); display:flex; flex-direction:column; gap:8px }
.exectoggle{ align-self:flex-start; background:transparent; border:none; padding:0; font-size:10px; color:var(--mut); text-transform:uppercase; letter-spacing:.03em; font-weight:600; cursor:pointer; display:flex; gap:6px; align-items:center }
.exectoggle:hover{ color:var(--tx) }
.exectoggle .chev{ font-size:9px }
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
</style>
