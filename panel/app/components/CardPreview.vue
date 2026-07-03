<script setup lang="ts">
interface CardPreviewProps {
  cardId: string
  shot: boolean
  previewUrl: string
}

interface CardPreviewEmits {
  close: []
}

const props = defineProps<CardPreviewProps>()
const emit = defineEmits<CardPreviewEmits>()

function handleClose(): void {
  emit('close')
}
</script>

<template>
  <div class="preview-overlay" @click.self="handleClose">
    <div class="preview-panel">
      <header class="preview-header">
        <h3>Preview #{{ props.cardId }}</h3>
        <a
          v-if="props.previewUrl"
          class="open-preview-link"
          :href="props.previewUrl"
          target="_blank"
          rel="noopener"
        >abrir preview ao vivo ↗</a>
        <button type="button" class="close-btn" @click="handleClose">✕</button>
      </header>

      <div v-if="props.shot" class="preview-shot">
        <img :src="`/api/preview/${props.cardId}`" alt="preview do card">
      </div>
      <div v-else class="preview-empty">sem screenshot ainda.</div>
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
.preview-header { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--bd); padding-bottom: 12px; margin-bottom: 16px; }
.preview-header h3 { margin: 0; font-size: 17px; }
.open-preview-link { margin-left: auto; font-size: 12.5px; }
.close-btn {
  font: inherit; background: var(--panel2); color: var(--tx); border: 1px solid var(--bd);
  border-radius: 7px; padding: 4px 10px; cursor: pointer;
}
.preview-shot img { max-width: 100%; border-radius: 8px; border: 1px solid var(--bd); display: block; margin: 0 auto; }
.preview-empty { color: var(--mut); font-size: 13px; padding: 12px 0; }
</style>
