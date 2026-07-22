<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { RepoView } from '#shared/types'

interface SprintPanelProps {
  repos: RepoView[]
  sprintRepo: string
  sprintText: string
  sprintMsg: string
  stagedLinks: string[]
  stagedFiles: File[]
}

interface SprintPanelEmits {
  'update:sprintRepo': [value: string]
  'update:sprintText': [value: string]
  createSprint: []
  addStagedLink: [link: string]
  removeStagedLink: [index: number]
  addStagedFiles: [files: FileList]
  removeStagedFile: [index: number]
}

const props = defineProps<SprintPanelProps>()
const emit = defineEmits<SprintPanelEmits>()

const linkDraft = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const fileObjectUrls = new Map<File, string>()

function objectUrlFor(file: File): string {
  const cached = fileObjectUrls.get(file)
  if (cached) return cached
  const created = URL.createObjectURL(file)
  fileObjectUrls.set(file, created)
  return created
}

function releaseStaleObjectUrls(current: File[]): void {
  for (const [file, url] of fileObjectUrls) {
    if (!current.includes(file)) {
      URL.revokeObjectURL(url)
      fileObjectUrls.delete(file)
    }
  }
}

watch(() => props.stagedFiles, releaseStaleObjectUrls)
onBeforeUnmount(() => releaseStaleObjectUrls([]))

function addLink(): void {
  const trimmed = linkDraft.value.trim()
  if (!trimmed) return
  emit('addStagedLink', trimmed)
  linkDraft.value = ''
}

function openFilePicker(): void {
  fileInput.value?.click()
}

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length) emit('addStagedFiles', input.files)
  input.value = ''
}
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

    <div class="refs-add">
      <label for="sprint-ref-link">referências de design (opcional)</label>
      <div class="refs-linkrow">
        <input
          id="sprint-ref-link"
          v-model="linkDraft"
          type="url"
          placeholder="https://…"
          @keyup.enter="addLink"
        >
        <button type="button" class="ghost" :disabled="!linkDraft.trim()" @click="addLink">＋ link</button>
        <button type="button" class="ghost" @click="openFilePicker">＋ imagem</button>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          class="hidden-file-input"
          @change="handleFileChange"
        >
      </div>

      <ul v-if="stagedLinks.length || stagedFiles.length" class="staged-grid">
        <li v-for="(link, index) in stagedLinks" :key="`link-${index}-${link}`" class="staged-chip">
          <span class="staged-chip-text" :title="link">{{ link }}</span>
          <button
            type="button"
            class="staged-remove"
            :aria-label="`remover referência de link ${index + 1}`"
            title="remover"
            @click="emit('removeStagedLink', index)"
          >✕</button>
        </li>
        <li v-for="(file, index) in stagedFiles" :key="`file-${index}-${file.name}`" class="staged-thumb">
          <img :src="objectUrlFor(file)" :alt="`referência de imagem ${file.name}`">
          <button
            type="button"
            class="staged-remove"
            :aria-label="`remover referência de imagem ${file.name}`"
            title="remover"
            @click="emit('removeStagedFile', index)"
          >✕</button>
        </li>
      </ul>
    </div>

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
button.ghost{ background:var(--panel2); border-color:var(--bd); color:var(--tx); font-weight:500 }
button:disabled{ opacity:.5; cursor:not-allowed }
.row{ display:flex; gap:8px; flex-wrap:wrap } .row.mt{ margin-top:10px }
.msg{ font-size:12px; min-height:16px; margin-top:8px; color:var(--mut) }
.refs-add{ margin-top:8px }
.refs-linkrow{ display:flex; gap:6px }
.refs-linkrow input{ flex:1; min-width:0 }
.hidden-file-input{ position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0 }
.staged-grid{ list-style:none; display:flex; flex-wrap:wrap; gap:8px; margin:10px 0 0; padding:0 }
.staged-chip{
  position:relative; display:flex; align-items:center; max-width:180px;
  background:var(--panel2); border:1px solid var(--bd); border-radius:7px; padding:6px 22px 6px 10px;
}
.staged-chip-text{ font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.staged-thumb{ position:relative; width:56px; height:56px; border-radius:8px; overflow:hidden; border:1px solid var(--bd) }
.staged-thumb img{ width:100%; height:100%; object-fit:cover; display:block }
.staged-remove{
  position:absolute; top:2px; right:2px; width:18px; height:18px; line-height:1; padding:0;
  display:flex; align-items:center; justify-content:center;
  font-size:10px; font-weight:700; color:#fff; background:rgba(0,0,0,.55);
  border:none; border-radius:50%; cursor:pointer;
}
.staged-chip .staged-remove{ position:static; margin-left:6px; background:transparent; color:var(--mut) }
.staged-chip .staged-remove:hover{ color:var(--bad) }
.staged-thumb .staged-remove:hover{ background:var(--bad) }
</style>
