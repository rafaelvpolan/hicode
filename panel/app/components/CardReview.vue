<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { ReviewChangedFile } from '#shared/types'
import { useReview } from '../composables/useReview'
import ReviewFileRow from './ReviewFileRow.vue'

interface CardReviewProps {
  cardId: string
}

interface CardReviewEmits {
  close: []
}

const props = defineProps<CardReviewProps>()
defineEmits<CardReviewEmits>()

const { data, loading, error, diffs, correcting, openReview, close, loadFileDiff, submitCorrection } = useReview()

onMounted(() => {
  void openReview(props.cardId)
})

interface PhaseGroup {
  phase: string
  files: ReviewChangedFile[]
}

const filesByPhase = computed<PhaseGroup[]>(() => {
  const files = data.value?.files ?? []
  const order: string[] = []
  const groups = new Map<string, ReviewChangedFile[]>()
  for (const file of files) {
    const phase = file.phase || 'Outros'
    if (!groups.has(phase)) {
      groups.set(phase, [])
      order.push(phase)
    }
    groups.get(phase)?.push(file)
  }
  return order.map((phase) => ({ phase, files: groups.get(phase) ?? [] }))
})

const verdictLabel = computed<string>(() => data.value?.verdict || 'sem veredito')
const canCorrect = computed<boolean>(() => data.value?.canCorrect ?? false)

function verdictClass(verdict: string | undefined): string {
  const normalized = (verdict || '').toUpperCase()
  if (normalized === 'APPROVED') return 'ok'
  if (normalized === 'CONDITIONAL') return 'warn'
  if (normalized === 'BLOCKED') return 'bad'
  return 'neutral'
}

function handleClose(): void {
  close()
}
</script>

<template>
  <div class="review-overlay" @click.self="handleClose">
    <div class="review-panel">
      <header class="review-header">
        <div class="review-title-row">
          <h3>{{ data?.title || `Review #${cardId}` }}</h3>
          <span v-if="data?.source" class="source-badge" :class="data.source">{{ data.source }}</span>
          <span class="verdict-badge" :class="verdictClass(data?.verdict)">{{ verdictLabel }}</span>
          <span v-if="!loading" class="auto-refresh">↻ auto-atualizando</span>
          <button type="button" class="close-btn" @click="handleClose">✕</button>
        </div>
        <p v-if="data?.reason" class="reason">{{ data.reason }}</p>
      </header>

      <div v-if="loading" class="loading">carregando review…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <template v-else-if="data">
        <section v-if="data.questions.length" class="questions">
          <h4>Perguntas ao revisor</h4>
          <ul>
            <li v-for="(q, i) in data.questions" :key="i">
              <label><input type="checkbox" disabled> {{ q }}</label>
            </li>
          </ul>
        </section>

        <section class="preview-section">
          <h4>Preview</h4>
          <div v-if="data.preview.shot" class="preview-shot">
            <img :src="`/api/preview/${cardId}`" alt="preview do card">
          </div>
          <div v-else class="preview-empty">sem screenshot ainda.</div>
          <a
            v-if="data.preview.running && data.preview.url"
            class="open-preview-link"
            :href="data.preview.url"
            target="_blank"
            rel="noopener"
          >abrir preview ↗</a>
        </section>

        <section class="files-section">
          <h4>Arquivos alterados</h4>
          <div v-if="!data.files.length" class="empty">nenhum arquivo alterado ainda.</div>
          <div v-for="group in filesByPhase" :key="group.phase" class="phase-group">
            <div class="phase-label">{{ group.phase }}</div>
            <ReviewFileRow
              v-for="file in group.files"
              :key="file.path"
              :file="file"
              :diff="diffs[file.path]"
              :correcting="correcting || data.status === 'CORRECTING'"
              :can-correct="canCorrect"
              @expand="loadFileDiff"
              @correct="submitCorrection"
            />
          </div>
        </section>

        <footer v-if="data.pr_url" class="review-footer">
          <a class="pr-link" :href="data.pr_url" target="_blank" rel="noopener">🔗 Abrir PR</a>
        </footer>
      </template>
    </div>
  </div>
</template>

<style scoped>
.review-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.65); z-index: 200;
  display: flex; align-items: stretch; justify-content: flex-end;
}
.review-panel {
  background: var(--panel); border-left: 1px solid var(--bd); width: min(920px, 100%);
  height: 100%; overflow: auto; padding: 20px 22px 40px;
}
.review-header { border-bottom: 1px solid var(--bd); padding-bottom: 12px; margin-bottom: 16px; }
.review-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.review-title-row h3 { margin: 0; font-size: 17px; }
.reason { color: var(--mut); font-size: 13px; margin: 8px 0 0; }
.source-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px;
  border: 1px solid var(--bd); text-transform: uppercase; color: var(--mut);
}
.source-badge.pr { color: var(--acc); border-color: color-mix(in srgb, var(--acc) 45%, transparent); }
.verdict-badge {
  font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px;
  border: 1px solid var(--bd); text-transform: uppercase;
}
.verdict-badge.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, transparent); }
.verdict-badge.warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 50%, transparent); }
.verdict-badge.bad { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 50%, transparent); }
.verdict-badge.neutral { color: var(--mut); }
.auto-refresh { font-size: 11px; color: var(--mut); margin-left: auto; }
.close-btn {
  font: inherit; background: var(--panel2); color: var(--tx); border: 1px solid var(--bd);
  border-radius: 7px; padding: 4px 10px; cursor: pointer;
}
.loading, .error, .empty { color: var(--mut); font-size: 13px; padding: 12px 0; }
.error { color: var(--bad); }
.questions { margin-bottom: 18px; }
.questions h4, .preview-section h4, .files-section h4 {
  font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--mut); margin: 0 0 8px;
}
.questions ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.questions label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.preview-section { margin-bottom: 20px; }
.preview-shot img { max-width: 100%; border-radius: 8px; border: 1px solid var(--bd); display: block; }
.preview-empty { color: var(--mut); font-size: 13px; }
.open-preview-link { display: inline-block; margin-top: 8px; font-size: 12.5px; }
.phase-group { margin-bottom: 16px; }
.phase-label {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
  color: var(--acc); margin-bottom: 6px;
}
.review-footer { margin-top: 20px; border-top: 1px solid var(--bd); padding-top: 14px; }
.pr-link {
  background: var(--acc); border: 1px solid var(--acc); color: #fff; padding: 7px 14px;
  border-radius: 8px; font-weight: 600; font-size: 13px;
}
.pr-link:hover { text-decoration: none; }
</style>
