<script setup lang="ts">
import { toRef } from 'vue'
import { useCardRefs } from '../composables/useCardRefs'

interface CardRefsProps {
  cardId: string
}

const props = defineProps<CardRefsProps>()

const cardIdRef = toRef(props, 'cardId')
const { refs, loading, error, linkInput, atCap, addLink, uploadFiles, removeAt, thumbSrc } = useCardRefs(cardIdRef)

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length) void uploadFiles(input.files)
  input.value = ''
}
</script>

<template>
  <div class="refs">
    <div class="refs-head">
      <span class="refs-title">imagens de referência de design</span>
      <span class="refs-count">{{ refs.length }}/8</span>
    </div>

    <p v-if="loading" class="refs-msg">carregando…</p>
    <p v-else-if="!refs.length" class="refs-msg">nenhuma referência anexada ainda.</p>
    <ul v-else class="refs-grid">
      <li v-for="(source, index) in refs" :key="`${index}-${source}`" class="refs-item">
        <img :src="thumbSrc(source, index)" :alt="`referência de design ${index + 1}`">
        <button
          type="button"
          class="refs-remove"
          :aria-label="`remover referência ${index + 1}`"
          title="remover referência"
          @click="removeAt(index)"
        >✕</button>
      </li>
    </ul>

    <p v-if="error" class="refs-error" role="alert">{{ error }}</p>

    <div class="refs-add">
      <div class="refs-field">
        <label :for="`refs-link-${cardId}`">adicionar link de imagem</label>
        <div class="refs-linkrow">
          <input
            :id="`refs-link-${cardId}`"
            v-model="linkInput"
            type="url"
            placeholder="https://…"
            :disabled="atCap"
            @keyup.enter="addLink"
          >
          <button type="button" class="ghost" :disabled="atCap || !linkInput.trim()" @click="addLink">＋ link</button>
        </div>
      </div>
      <div class="refs-field">
        <label :for="`refs-upload-${cardId}`">enviar imagem(ns) do computador</label>
        <input
          :id="`refs-upload-${cardId}`"
          type="file"
          accept="image/*"
          multiple
          :disabled="atCap"
          @change="handleFileChange"
        >
      </div>
      <p v-if="atCap" class="refs-cap">limite de 8 referências atingido — remova alguma para adicionar outra.</p>
    </div>
  </div>
</template>

<style scoped>
.refs{ display:flex; flex-direction:column; gap:8px; margin:8px 0 }
.refs-head{ display:flex; align-items:baseline; gap:8px }
.refs-title{ font-size:12px; color:var(--mut); text-transform:uppercase; letter-spacing:.03em; font-weight:600 }
.refs-count{ font-size:11px; color:var(--mut) }
.refs-msg{ margin:0; font-size:13px; color:var(--mut) }
.refs-grid{ list-style:none; display:flex; flex-wrap:wrap; gap:8px; margin:0; padding:0 }
.refs-item{ position:relative; width:72px; height:72px; border-radius:8px; overflow:hidden; border:1px solid var(--bd) }
.refs-item img{ width:100%; height:100%; object-fit:cover; display:block }
.refs-remove{
  position:absolute; top:2px; right:2px; width:20px; height:20px; line-height:1;
  display:flex; align-items:center; justify-content:center;
  font-size:11px; font-weight:700; color:#fff; background:rgba(0,0,0,.55);
  border:none; border-radius:50%; cursor:pointer;
}
.refs-remove:hover{ background:var(--bad) }
.refs-error{ margin:0; font-size:12px; color:var(--bad) }
.refs-add{ display:flex; flex-direction:column; gap:8px }
.refs-field{ display:flex; flex-direction:column; gap:3px }
.refs-field label{ font-size:12px; color:var(--mut) }
.refs-linkrow{ display:flex; gap:6px }
.refs-linkrow input{ flex:1 }
input, button{ font:inherit; color:var(--tx); background:var(--panel2); border:1px solid var(--bd); border-radius:7px; padding:7px 10px }
input[type="file"]{ padding:5px 8px }
button{ background:var(--acc); border-color:var(--acc); color:#fff; cursor:pointer; font-weight:600 }
button.ghost{ background:var(--panel2); border-color:var(--bd); color:var(--tx); font-weight:500 }
button:disabled{ opacity:.5; cursor:not-allowed }
.refs-cap{ margin:0; font-size:12px; color:var(--warn) }
</style>
