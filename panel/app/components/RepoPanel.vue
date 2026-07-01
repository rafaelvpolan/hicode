<script setup lang="ts">
import type { GhRepoItem, NewRepoForm, ProjectPreviewState, RepoView } from '#shared/types'

interface RepoPanelProps {
  repos: RepoView[]
  gh: GhRepoItem[]
  newRepo: NewRepoForm
  repoMsg: string
  projectPreview: ProjectPreviewState
}

interface RepoPanelEmits {
  addRepo: []
  loadGh: []
  quickAdd: [name: string, url: string]
}

defineProps<RepoPanelProps>()
defineEmits<RepoPanelEmits>()
</script>

<template>
  <section class="card-sec">
    <h2>Repositórios</h2>
    <div v-if="projectPreview.url || projectPreview.msg" class="msg ok">preview do projeto: <a v-if="projectPreview.url" :href="projectPreview.url" target="_blank" rel="noopener">{{ projectPreview.url }}</a> {{ projectPreview.msg }}</div>
    <div class="repolist">
      <div v-if="!repos.length" class="empty">nenhum repo — adicione ou busque do GitHub.</div>
      <div v-for="r in repos" :key="r.name" class="item"><span class="nm">{{ r.name }}</span><span class="meta">{{ r.branch || 'main' }} · {{ r.runCmd || 'sem run' }}</span></div>
    </div>
    <div class="row">
      <div><label>Nome (owner/repo)</label><input v-model="newRepo.name" placeholder="rafaelvpolan/hicode-site"></div>
      <div><label>Branch</label><input v-model="newRepo.branch" placeholder="main"></div>
    </div>
    <div class="row">
      <div><label>Git URL</label><input v-model="newRepo.url"></div>
      <div><label>Run (preview)</label><input v-model="newRepo.runCmd" placeholder="npm run dev"></div>
    </div>
    <div class="row mt"><button @click="$emit('addRepo')">+ adicionar</button><button class="ghost" @click="$emit('loadGh')">buscar do GitHub</button></div>
    <div class="msg">{{ repoMsg }}</div>
    <div class="ghlist">
      <div v-for="it in gh" :key="it.nameWithOwner" class="item"><span class="nm">{{ it.nameWithOwner }}</span><span class="meta">{{ it.visibility || '' }}</span><span class="sp"><button class="ghost sm" @click="$emit('quickAdd', it.nameWithOwner, it.url || '')">adicionar</button></span></div>
    </div>
  </section>
</template>

<style scoped>
.card-sec{ background:var(--panel); border:1px solid var(--bd); border-radius:10px; padding:16px }
.card-sec h2{ font-size:13px; text-transform:uppercase; letter-spacing:.04em; color:var(--mut); margin:0 0 12px }
label{ display:block; font-size:12px; color:var(--mut); margin:8px 0 3px }
input,select,button{ font:inherit; color:var(--tx); background:var(--panel2); border:1px solid var(--bd); border-radius:7px; padding:7px 10px }
input,select{ width:100% }
button{ background:var(--acc); border-color:var(--acc); color:#fff; cursor:pointer; font-weight:600 }
button.ghost{ background:var(--panel2); border-color:var(--bd); color:var(--tx); font-weight:500 }
button.sm{ padding:4px 10px; font-size:12px }
.row{ display:flex; gap:8px; flex-wrap:wrap } .row.mt{ margin-top:10px } .row>div{ flex:1; min-width:120px }
.repolist,.ghlist{ display:flex; flex-direction:column; gap:6px; margin:8px 0; max-height:240px; overflow:auto }
.item{ display:flex; gap:10px; align-items:center; padding:8px 10px; background:var(--panel2); border:1px solid var(--bd); border-radius:7px }
.item .nm{ font-weight:600 } .item .meta{ color:var(--mut); font-size:12px } .item .sp{ margin-left:auto }
.msg{ font-size:12px; min-height:16px; margin-top:8px; color:var(--mut) } .msg.ok{ color:var(--ok) }
.empty{ color:var(--mut); font-size:13px; padding:6px 2px }
</style>
