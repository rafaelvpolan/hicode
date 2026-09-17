<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ROTULOS_PRODUTO, conclusaoDoEpico } from '#shared/progresso-produto'
import type { PaginaDeProgresso, ProgressoProduto } from '#shared/progresso-produto'
const props = defineProps<{ planejamento: string; revisao: number }>()
const tarefas = ref<ProgressoProduto[]>([])
const total = ref(0)
const proxima = ref<number | null>(null)
const ocupado = ref(false)
const aviso = ref('Consulte as evidencias da revisao salva.')
const consultadaEm = ref('')
let geracao = 0
const concluido = computed(() => conclusaoDoEpico(tarefas.value, total.value))
const concluidas = computed(() => tarefas.value.filter(t => t.estado === 'concluida').length)
const prontas = computed(() => tarefas.value.filter(t => t.estado === 'aguarda_revisao').length)
watch(() => [props.planejamento, props.revisao], () => { geracao++; tarefas.value = []; total.value = 0; proxima.value = null; ocupado.value = false; consultadaEm.value = ''; aviso.value = 'A revisao mudou; consulte novamente.' })
async function carregar(continuar = false): Promise<void> {
  if (ocupado.value) return
  const minhaGeracao = ++geracao
  const depois = continuar ? proxima.value : 0
  if (depois === null) return
  ocupado.value = true
  if (!continuar) { tarefas.value = []; total.value = 0; consultadaEm.value = '' }
  try {
    const p = await $fetch<PaginaDeProgresso>('/api/hii/progresso', { query: { planejamento: props.planejamento, revisao: props.revisao, depois } })
    if (minhaGeracao !== geracao) return
    tarefas.value = continuar ? [...tarefas.value, ...p.tarefas] : p.tarefas
    total.value = p.total; proxima.value = p.proxima; consultadaEm.value = p.consultadaEm
    aviso.value = 'Consulta somente leitura. Nao despacha tarefas nem repete testes.'
  } catch (e) {
    if (minhaGeracao !== geracao) return
    tarefas.value = []; total.value = 0; proxima.value = null; consultadaEm.value = ''
    aviso.value = (e as { statusMessage?: string }).statusMessage || 'Progresso indisponivel; nenhuma conclusao foi presumida.'
  } finally { if (minhaGeracao === geracao) ocupado.value = false }
}
</script>
<template>
  <section class="progresso" aria-labelledby="titulo-progresso">
    <h2 id="titulo-progresso">Progresso verificado do produto</h2>
    <p>Referente a revisao salva {{ revisao }}. Alteracoes no editor entram na proxima consulta depois de salvar.</p>
    <button :disabled="ocupado" @click="carregar()">Consultar evidencias do epico</button>
    <p role="status">{{ aviso }}</p>
    <template v-if="consultadaEm">
      <p>{{ tarefas.length }} de {{ total }} tarefas consultadas · {{ concluidas }} concluidas com evidencia · {{ prontas }} aguardam revisao.</p>
      <p>{{ concluido ? 'Epico concluido com evidencias na consulta.' : 'Epico ainda nao concluido com evidencias.' }} Consulta: {{ consultadaEm }}</p>
      <article v-for="t in tarefas" :key="t.id" class="progresso-tarefa">
        <h3>{{ t.titulo }} · {{ ROTULOS_PRODUTO[t.estado] }}</h3>
        <p>{{ t.motivo }}</p>
        <p v-if="t.dependeDe.length">Dependencias: {{ t.dependeDe.join(', ') }}</p>
        <NuxtLink :to="{ path: '/tecnico', query: { planejamento, produto: t.id } }">Revisar card tecnico</NuxtLink>
        <details v-if="t.avaliacao"><summary>Ver criterios da execucao #{{ t.execucao }}</summary><EvidenciasDaExecucao :avaliacao="t.avaliacao" /></details>
      </article>
      <button v-if="proxima !== null" :disabled="ocupado" @click="carregar(true)">Consultar proximas tarefas</button>
    </template>
  </section>
</template>
<style scoped>
.progresso{border:1px solid #65716a;border-radius:8px;padding:18px;margin:24px 0;overflow-wrap:anywhere}.progresso-tarefa{border-top:1px solid #65716a;margin-top:20px;padding-top:12px}h3{font-size:17px}button{font:inherit;padding:10px;background:transparent;color:inherit;border:1px solid #65716a;border-radius:5px;cursor:pointer}button:disabled{opacity:.5;cursor:default}details{margin-top:16px}summary{cursor:pointer}button:focus-visible,summary:focus-visible{outline:2px solid #76d8ad;outline-offset:3px}
</style>
