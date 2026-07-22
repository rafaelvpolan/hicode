<script setup lang="ts">
import type { EditingForm } from '#shared/types'

interface CardEditModalProps {
  editing: EditingForm
}

interface CardEditModalEmits {
  save: []
  close: []
}

defineProps<CardEditModalProps>()
defineEmits<CardEditModalEmits>()
</script>

<template>
  <div v-if="editing.open" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h3>Editar tarefa #{{ editing.id }}</h3>
      <label>Título</label>
      <input v-model="editing.title">
      <label>Task / descrição (texto inteiro)</label>
      <textarea v-model="editing.desc" rows="8"></textarea>
      <label>Risco</label>
      <select v-model="editing.risk"><option value="low">low</option><option value="high">high</option></select>
      <CardRefs v-if="editing.id" :card-id="editing.id" />
      <div v-if="editing.note" class="msg ok">{{ editing.note }}</div>
      <div class="modal-actions"><button @click="$emit('save')">Salvar</button><button class="ghost" @click="$emit('close')">Cancelar</button></div>
    </div>
  </div>
</template>

<style scoped>
label{ display:block; font-size:12px; color:var(--mut); margin:8px 0 3px }
input,textarea,select,button{ font:inherit; color:var(--tx); background:var(--panel2); border:1px solid var(--bd); border-radius:7px; padding:7px 10px }
input,textarea,select{ width:100% } textarea{ min-height:88px; resize:vertical }
button{ background:var(--acc); border-color:var(--acc); color:#fff; cursor:pointer; font-weight:600 }
button.ghost{ background:var(--panel2); border-color:var(--bd); color:var(--tx); font-weight:500 }
.msg.ok{ color:var(--ok); font-size:12px; margin-top:8px }
.modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px }
.modal{ background:var(--panel); border:1px solid var(--bd); border-radius:12px; padding:20px; width:100%; max-width:560px; max-height:90vh; overflow:auto }
.modal h3{ margin:0 0 12px } .modal-actions{ display:flex; gap:8px; margin-top:14px }
</style>
