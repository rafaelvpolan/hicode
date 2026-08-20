<script setup lang="ts">
import type { RejectingForm } from '#shared/types'

interface CardRejectModalProps {
  rejecting: RejectingForm
}

interface CardRejectModalEmits {
  confirm: []
  close: []
}

defineProps<CardRejectModalProps>()
defineEmits<CardRejectModalEmits>()
</script>

<template>
  <div v-if="rejecting.open" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h3>Rejeitar preview — card #{{ rejecting.id }}</h3>
      <label :for="`reject-reason-${rejecting.id}`">o que refazer? (vazio = só rejeitar, sem instrução)</label>
      <textarea
        :id="`reject-reason-${rejecting.id}`"
        v-model="rejecting.reason"
        rows="5"
        placeholder="descreva o que está errado e o que deve mudar…"
      ></textarea>
      <CardRefs v-if="rejecting.id" :card-id="rejecting.id" />
      <div class="modal-actions">
        <button @click="$emit('confirm')">✋ reprovar e refazer</button>
        <button class="ghost" @click="$emit('close')">Cancelar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
label{ display:block; font-size:12px; color:var(--texto-mudo); margin:8px 0 3px }
textarea{ font:inherit; color:var(--texto); background:var(--superficie-2); border:1px solid var(--hairline); border-radius:7px; padding:7px 10px; width:100%; min-height:110px; resize:vertical }
button{ font:inherit; color:var(--acento-contraste); background:var(--acento); border:1px solid var(--acento); border-radius:7px; padding:7px 10px; cursor:pointer; font-weight:600 }
button.ghost{ background:var(--superficie-2); border-color:var(--hairline); color:var(--texto); font-weight:500 }
.modal-overlay{ position:fixed; inset:0; background:var(--veu-modal); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px }
.modal{ background:var(--superficie); border:1px solid var(--hairline); border-radius:12px; padding:20px; width:100%; max-width:560px; max-height:90vh; overflow:auto }
.modal h3{ margin:0 0 12px } .modal-actions{ display:flex; gap:8px; margin-top:14px }
</style>
