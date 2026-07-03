<script setup lang="ts">
import type { CardView, RunView } from '#shared/types'
import { PHASES, RESUME_STEP_BY_STATUS, STEP_LIST, phaseIdx, stClass } from '../composables/usePhases'
import { fmtDt, fmtTime, runsFor } from '../composables/useFormat'

interface CardRowProps {
  card: CardView
  runs: RunView[]
}

interface CardRowEmits {
  start: [id: string]
  pause: [id: string]
  resume: [id: string]
  approve: [id: string]
  reject: [id: string]
  edit: [card: CardView]
  remove: [card: CardView]
  replay: [step: string]
  review: [id: string]
}

const props = defineProps<CardRowProps>()
defineEmits<CardRowEmits>()

const REVIEWABLE_STATUSES: CardView['status'][] = [
  'PREVIEW', 'CORRECTING', 'PREVIEW_OK', 'REFINED', 'TESTS_GREEN',
  'SEC_CLEARED', 'REVIEWED', 'CLEANED', 'PR_OPEN',
]

const cardRuns = computed(() => runsFor(props.runs, props.card.id))
const isReviewable = computed(() => REVIEWABLE_STATUSES.includes(props.card.status))

function resumeStepFor(status: string): string | null {
  return RESUME_STEP_BY_STATUS[status] ?? null
}
</script>

<template>
  <div class="erow" :class="{ high: card.risk === 'high' }">
    <div class="ehead">
      <span class="eid">#{{ card.id }}</span>
      <span class="etitle">{{ card.title }}</span>
      <span v-if="card.verify" class="vbadge" :class="card.verify" :title="'Check visual da IA'">{{ card.verify === 'ok' ? '✓ visual' : '⚠ visual' }}</span>
      <span v-if="card.revalidacao" class="vbadge" :class="card.revalidacao" :title="'Revalidação do projeto vs objetivo da tarefa'">{{ card.revalidacao === 'ok' ? '✓ reval' : '⚠ reval' }}</span>
      <span class="erepo">{{ card.repo || '—' }} · {{ card.risk }}<template v-if="card.cost_usd"> · ${{ card.cost_usd }}</template><template v-if="card.tokens_total"> · {{ Number(card.tokens_total).toLocaleString('pt-BR') }} tok</template></span>
      <span class="etools"><button class="icon" title="Editar tarefa" @click="$emit('edit', card)">✏️</button><button class="icon del" title="Remover" @click="$emit('remove', card)">🗑</button></span>
    </div>
    <div v-if="card.desc && card.desc !== card.title" class="edesc">{{ card.desc }}</div>

    <div v-if="card.status === 'HALTED'" class="halt">⛔ HALTED — precisa de você</div>
    <div v-else-if="card.status === 'PAUSED'" class="paused">⏸ pausado — clique Retomar</div>
    <div v-else class="stepper">
      <span v-for="(p, i) in PHASES" :key="p[0]" class="st" :class="stClass(i, phaseIdx(card.status))">
        <i></i><b>{{ p[1] }}</b>
        <button
          v-if="resumeStepFor(p[0])"
          class="replay"
          type="button"
          title="rodar a partir daqui"
          @click="$emit('replay', resumeStepFor(p[0]) as string)"
        >▶</button>
      </span>
    </div>

    <div class="erow-actions">
      <button v-if="['INBOX', 'READY'].includes(card.status)" @click="$emit('start', card.id)">▶ Começar</button>
      <template v-else-if="card.status === 'EXECUTING'"><span class="run">⏳ executando…</span><button class="ghost" @click="$emit('pause', card.id)">⏸ Pausar</button></template>
      <template v-else-if="card.status === 'PAUSED'"><span class="run">⏸ pausado</span><button @click="$emit('resume', card.id)">▶ Retomar</button></template>
      <template v-else-if="card.status === 'PREVIEW'"><button @click="$emit('approve', card.id)">✅ Aprovar</button><button class="ghost" @click="$emit('reject', card.id)">✋ Rejeitar</button></template>
      <a v-else-if="card.status === 'PR_OPEN' && card.pr_url" class="btnlink" :href="card.pr_url" target="_blank" rel="noopener">🔗 Abrir PR</a>
      <a v-if="['PREVIEW', 'PREVIEW_OK'].includes(card.status) && card.preview_url" class="prevlink" :href="card.preview_url" target="_blank" rel="noopener">abrir preview ↗</a>
      <button v-if="isReviewable" class="ghost" @click="$emit('review', card.id)">🔍 Review</button>
    </div>
    <a v-if="card.status === 'PREVIEW' && card.shot" :href="card.preview_url || '#'" target="_blank" rel="noopener"><img class="shot" :src="`/api/preview/${card.id}`" alt="preview"></a>
    <div v-if="cardRuns.length" class="execs">
      <div class="execlbl">execuções ({{ cardRuns.length }})</div>
      <div v-for="(r, i) in cardRuns" :key="i" class="exec">
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
.edesc{ white-space:pre-wrap; color:var(--mut); font-size:13px; margin:8px 0 2px; border-left:2px solid var(--bd); padding-left:10px }
.stepper{ display:flex; gap:10px; flex-wrap:wrap; margin:11px 0 4px }
.st{ display:flex; align-items:center; gap:5px; font-size:11px }
.st i{ width:9px; height:9px; border-radius:50%; background:var(--bd); display:inline-block; flex:0 0 auto }
.st.done i{ background:var(--ok) } .st.done b{ color:var(--mut); font-weight:500 }
.st.now i{ background:var(--acc); box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 30%,transparent) } .st.now b{ color:var(--tx) }
.st.todo b{ color:#566 } .st.todo i{ opacity:.5 } .st b{ font-weight:600 }
.st .replay{ opacity:0; width:auto; font-size:10px; line-height:1; padding:1px 5px; margin:0; border:1px solid var(--bd); border-radius:5px; background:var(--panel2); color:var(--acc); cursor:pointer; transition:opacity .12s }
.st:hover .replay{ opacity:1 }
.st .replay:hover{ border-color:var(--acc) }
.erow-actions{ display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap }
.erow-actions button{ padding:6px 12px; font-size:13px }
.erow-actions button.ghost{ background:var(--panel2); border-color:var(--bd); color:var(--tx); font-weight:500 }
.run{ color:var(--acc); font-size:13px; font-weight:600 }
.btnlink{ background:var(--acc); border:1px solid var(--acc); color:#fff; padding:6px 12px; border-radius:8px; font-weight:600; font-size:13px }
.btnlink:hover{ text-decoration:none }
.prevlink{ font-size:12px } .halt{ color:var(--bad); font-weight:600; margin:8px 0 } .paused{ color:var(--gold); font-weight:600; margin:8px 0 }
.shot{ max-width:440px; width:100%; border-radius:6px; border:1px solid var(--bd); margin-top:8px; display:block }
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
</style>
