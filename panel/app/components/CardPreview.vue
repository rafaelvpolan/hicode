<script setup lang="ts">
import { computed, ref } from 'vue'

interface CardPreviewProps {
  cardId: string
  shot: boolean
  previewUrl: string
}

interface CardPreviewEmits {
  close: []
  reset: [hard: boolean]
}

const props = defineProps<CardPreviewProps>()
const emit = defineEmits<CardPreviewEmits>()

const showShot = ref(false)
const shotFailed = ref(false)
const refreshCounter = ref(0)

const canCaptureShot = computed(() => props.shot || !!props.previewUrl)
const shotSrc = computed(() => `/api/preview/${props.cardId}?fresh=1&t=${refreshCounter.value}`)

function handleClose(): void {
  emit('close')
}

function handleReset(hard: boolean): void {
  emit('reset', hard)
}

function toggleShot(): void {
  showShot.value = !showShot.value
  if (showShot.value) shotFailed.value = false
}

function recaptureShot(): void {
  refreshCounter.value += 1
  shotFailed.value = false
}

function handleShotError(): void {
  shotFailed.value = true
}
</script>

<template>
  <div class="preview-overlay" @click.self="handleClose">
    <div class="preview-panel">
      <header class="preview-header">
        <h3>Preview #{{ props.cardId }}</h3>
        <div class="preview-header-actions">
          <a
            v-if="props.previewUrl"
            class="open-preview-link"
            :href="props.previewUrl"
            target="_blank"
            rel="noopener"
          >▶ abrir preview ao vivo ↗</a>
          <button type="button" class="reset-btn" @click="handleReset(false)">🔄 resetar preview</button>
          <button type="button" class="reset-btn hard" @click="handleReset(true)">🧹 resetar + limpar cache</button>
          <button type="button" class="close-btn" @click="handleClose">✕</button>
        </div>
      </header>

      <div v-if="!props.previewUrl" class="preview-empty">sem preview ao vivo configurado para este card.</div>

      <div class="preview-fallback">
        <button type="button" class="toggle-shot" @click="toggleShot">
          {{ showShot ? 'ocultar screenshot' : 'ver screenshot (fallback)' }}
        </button>
        <button v-if="showShot" type="button" class="recapture" @click="recaptureShot">↻ recapturar</button>
      </div>

      <div v-if="showShot" class="preview-shot">
        <img
          v-if="canCaptureShot && !shotFailed"
          :src="shotSrc"
          alt="preview do card"
          @error="handleShotError"
        >
        <div v-else class="preview-empty">sem screenshot disponível para este card.</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.65); z-index: 200;
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.preview-panel {
  background: var(--panel); border: 1px solid var(--bd); border-radius: 10px;
  width: min(1100px, 100%); max-height: 92vh; overflow: auto; padding: 20px 22px 28px;
}
.preview-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; border-bottom: 1px solid var(--bd); padding-bottom: 12px; margin-bottom: 16px; }
.preview-header h3 { margin: 0; font-size: 17px; }
.preview-header-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.open-preview-link {
  font-weight: 700; font-size: 13px; background: var(--acc); color: #fff;
  padding: 6px 14px; border-radius: 8px; border: 1px solid var(--acc);
}
.open-preview-link:hover { text-decoration: none; filter: brightness(1.08); }
.reset-btn {
  font: inherit; background: var(--panel2); color: var(--tx); border: 1px solid var(--bd);
  border-radius: 7px; padding: 4px 10px; cursor: pointer; font-size: 12.5px; font-weight: 600;
}
.reset-btn:hover { border-color: var(--acc); }
.reset-btn.hard:hover { border-color: var(--warn); color: var(--warn); }
.close-btn {
  font: inherit; background: var(--panel2); color: var(--tx); border: 1px solid var(--bd);
  border-radius: 7px; padding: 4px 10px; cursor: pointer;
}
.preview-fallback { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
.toggle-shot, .recapture {
  font: inherit; background: transparent; color: var(--mut); border: 1px solid var(--bd);
  border-radius: 7px; padding: 4px 10px; cursor: pointer; font-size: 12px;
}
.toggle-shot:hover, .recapture:hover { color: var(--tx); border-color: var(--acc); }
.preview-shot img { max-width: 100%; border-radius: 8px; border: 1px solid var(--bd); display: block; margin: 0 auto; }
.preview-empty { color: var(--mut); font-size: 13px; padding: 12px 0; }
</style>
