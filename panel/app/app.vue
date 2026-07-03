<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useDashboard } from './composables/useDashboard'
import { useCardActions } from './composables/useCardActions'
import { usePhases } from './composables/usePhases'

const { state, runs, gh, sprintRepo, load } = useDashboard()
const {
  newRepo, repoMsg, sprintMsg, sprintText, projectPreview, editing,
  addRepo, loadGh, quickAdd, createSprint, runProjectPreview,
  start, pause, resume, act, reject, replay, removeCard, openEdit, saveEdit, closeEdit,
} = useCardActions({ load, gh, sprintRepo })

const cardsRef = toRef(state, 'cards')
const { kpis } = usePhases(cardsRef, runs)

const reviewingCardId = ref<string>('')
const previewingCardId = ref<string>('')

function openReviewFor(id: string): void {
  reviewingCardId.value = id
}

function closeReview(): void {
  reviewingCardId.value = ''
}

function openPreviewFor(id: string): void {
  previewingCardId.value = id
}

function closePreview(): void {
  previewingCardId.value = ''
}

const previewingCard = computed(() => state.cards.find((c) => c.id === previewingCardId.value))
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
    <KpiBar :kpis="kpis" />

    <div class="grid2">
      <RepoPanel
        :repos="state.repos"
        :gh="gh"
        :new-repo="newRepo"
        :repo-msg="repoMsg"
        :project-preview="projectPreview"
        @add-repo="addRepo"
        @load-gh="loadGh"
        @quick-add="quickAdd"
      />

      <SprintPanel
        :repos="state.repos"
        :sprint-repo="sprintRepo"
        :sprint-text="sprintText"
        :sprint-msg="sprintMsg"
        @update:sprint-repo="sprintRepo = $event"
        @update:sprint-text="sprintText = $event"
        @create-sprint="createSprint"
      />
    </div>

    <section class="card-sec">
      <h2>Execução — fases de cada card</h2>
      <div v-if="!state.cards.length" class="empty">nenhum card — crie features na sprint acima.</div>
      <CardRow
        v-for="c in state.cards"
        :key="c.id"
        :card="c"
        :runs="runs"
        @start="start"
        @pause="pause"
        @resume="resume"
        @approve="(id) => act(id, 'approve')"
        @reject="reject"
        @edit="openEdit"
        @remove="removeCard"
        @replay="(step) => replay(c.id, step)"
        @review="openReviewFor"
        @preview="openPreviewFor"
      />
    </section>
  </main>

  <CardEditModal :editing="editing" @save="saveEdit" @close="closeEdit" />
  <ClientOnly>
    <CardReview v-if="reviewingCardId" :card-id="reviewingCardId" @close="closeReview" />
    <CardPreview
      v-if="previewingCardId"
      :card-id="previewingCardId"
      :shot="previewingCard?.shot ?? false"
      :preview-url="previewingCard?.preview_url ?? ''"
      @close="closePreview"
    />
  </ClientOnly>
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
button{ font:inherit; color:var(--tx); background:var(--acc); border:1px solid var(--acc); border-radius:7px; padding:7px 10px; cursor:pointer; font-weight:600 }
button.ghost{ background:var(--panel2); border-color:var(--bd); color:var(--tx); font-weight:500 }
.empty{ color:var(--mut); font-size:13px; padding:6px 2px }
</style>
