<script setup lang="ts">
import type { RepoView } from '#shared/types'

interface SprintPanelProps {
  repos: RepoView[]
  sprintRepo: string
  sprintText: string
  sprintMsg: string
}

interface SprintPanelEmits {
  'update:sprintRepo': [value: string]
  'update:sprintText': [value: string]
  createSprint: []
}

defineProps<SprintPanelProps>()
defineEmits<SprintPanelEmits>()
</script>

<template>
  <section class="card-sec">
    <h2>Sprint — feature</h2>
    <label>Repositório</label>
    <select :value="sprintRepo" @change="$emit('update:sprintRepo', ($event.target as HTMLSelectElement).value)">
      <option v-if="!repos.length" value="">(adicione um repo)</option>
      <option v-for="r in repos" :key="r.name" :value="r.name">{{ r.name }}</option>
    </select>
    <label>Feature — <strong>todo o texto vira UM card</strong> (1ª linha = título · <code>!</code> = risco alto)</label>
    <textarea :value="sprintText" placeholder="Altere o título do hero para:&#10;Prompts resolvem tarefas.&#10;Loops inteligentes constroem sistemas." @input="$emit('update:sprintText', ($event.target as HTMLTextAreaElement).value)"></textarea>
    <div class="row mt"><button @click="$emit('createSprint')">criar card da sprint</button></div>
    <div class="msg">{{ sprintMsg }}</div>
  </section>
</template>

<style scoped>
.card-sec{ background:var(--panel); border:1px solid var(--bd); border-radius:10px; padding:16px }
.card-sec h2{ font-size:13px; text-transform:uppercase; letter-spacing:.04em; color:var(--mut); margin:0 0 12px }
label{ display:block; font-size:12px; color:var(--mut); margin:8px 0 3px }
input,textarea,select,button{ font:inherit; color:var(--tx); background:var(--panel2); border:1px solid var(--bd); border-radius:7px; padding:7px 10px }
textarea,select{ width:100% } textarea{ min-height:88px; resize:vertical }
button{ background:var(--acc); border-color:var(--acc); color:#fff; cursor:pointer; font-weight:600 }
.row{ display:flex; gap:8px; flex-wrap:wrap } .row.mt{ margin-top:10px }
.msg{ font-size:12px; min-height:16px; margin-top:8px; color:var(--mut) }
</style>
