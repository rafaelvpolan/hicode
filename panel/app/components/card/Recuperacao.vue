<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { CardView } from '#shared/types'
import type { RecuperacaoDoPainel } from '#shared/recuperacao'
const props = defineProps<{ card: CardView }>()
const dados = ref<RecuperacaoDoPainel | null>(null)
const escolhido = ref('')
const snapshotEscolhido = computed(() => dados.value?.diagnostico?.snapshots.find(s => s.hash === escolhido.value))
const ocupado = ref(false)
const erro = ref('')
let timer: ReturnType<typeof setInterval> | undefined
async function acao(nome: string): Promise<void> {
  if (ocupado.value || !props.card.arquivo) return
  ocupado.value = true; erro.value = ''
  try {
    dados.value = await $fetch<RecuperacaoDoPainel>('/api/recuperacao', { method: 'POST', body: {
      acao: nome, arquivo: props.card.arquivo, hash: nome === 'configurar' ? escolhido.value : dados.value?.previa.hash,
      revisao: dados.value?.diagnostico?.revisao, fingerprint: dados.value?.diagnostico?.fingerprint,
    } })
  } catch (e) {
    const falha = e as { data?: { statusMessage?: string }; message?: string }
    erro.value = falha.data?.statusMessage || falha.message || 'Recuperacao sem confirmacao. Consulte novamente.'
  } finally { ocupado.value = false }
}
onMounted(() => {
  if (props.card.recuperacao) void acao('diagnosticar')
  timer = setInterval(() => { if (dados.value?.vinculo?.estado === 'confirmado' && !ocupado.value) void acao('diagnosticar') }, 5000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>
<template>
  <section v-if="card.arquivo" class="recuperacao" aria-label="Recuperacao da tarefa">
    <button type="button" :disabled="ocupado" @click="acao('diagnosticar')">{{ ocupado ? 'Consultando motor…' : 'Diagnosticar recuperacao' }}</button>
    <p v-if="erro" role="alert" class="erro">{{ erro }}</p>
    <template v-if="dados">
      <p>{{ dados.previa.motivo }}</p>
      <p v-if="dados.vinculo?.estado === 'pendente'">Envio pendente de confirmacao. O original esta preservado.</p>
      <p v-if="dados.diagnostico"><strong>HII #{{ dados.previa.tarefa }} · {{ dados.diagnostico.status }}</strong> · motor {{ dados.diagnostico.motor.estado }}</p>
      <details>
        <summary>Dados preservados</summary>
        <ul><li v-for="item in dados.previa.preservados" :key="item">{{ item }}</li></ul>
      </details>
      <template v-if="dados.diagnostico">
        <p v-for="item in dados.diagnostico.bloqueios" :key="item" class="erro">{{ item }}</p>
        <p v-for="item in dados.diagnostico.avisos" :key="item">{{ item }}</p>
        <p v-if="dados.diagnostico.branch">Branch preservada: {{ dados.diagnostico.branch }}</p>
        <details v-if="dados.diagnostico.snapshots.length">
          <summary>Configuracoes registradas</summary>
          <label>Configuracao a restaurar
            <select v-model="escolhido" :disabled="ocupado">
              <option value="">Selecione um snapshot</option>
              <option v-for="s in dados.diagnostico.snapshots" :key="s.hash" :value="s.hash">{{ s.instante }} — {{ s.motivo }}</option>
            </select>
          </label>
          <template v-if="snapshotEscolhido">
            <p>A configuracao abaixo sera usada nos proximos despachos desta tarefa. A tarefa permanece parada.</p>
            <pre>{{ JSON.stringify(snapshotEscolhido.configuracao, null, 2) }}</pre>
            <button type="button" :disabled="ocupado || !['PAUSED', 'HALTED'].includes(dados.diagnostico.status)" @click="acao('configurar')">Restaurar esta configuracao</button>
          </template>
        </details>
      </template>
      <div class="acoes">
        <button v-if="dados.previa.estado === 'importar' || dados.vinculo?.estado === 'pendente'" type="button" :disabled="ocupado" @click="acao('importar')">Preservar e vincular ao HII</button>
        <button v-if="dados.diagnostico?.podePreparar" type="button" :disabled="ocupado" @click="acao('preparar')">Confirmar revalidacao da etapa</button>
        <button v-if="dados.vinculo?.estado === 'confirmado' && ['PAUSED', 'HALTED'].includes(dados.diagnostico?.status || '')" type="button" :disabled="ocupado || !!dados.diagnostico?.bloqueios.length || !dados.diagnostico?.preparada" @click="acao('retomar')">Retomar pelo motor</button>
      </div>
    </template>
  </section>
</template>
<style scoped>
.recuperacao { display: grid; gap: .7rem; border: 1px solid var(--hairline); border-radius: 12px 4px 12px 12px; padding: 1rem; color: var(--texto); overflow-wrap: anywhere; }
.recuperacao p { margin: 0; }
.acoes { display: flex; flex-wrap: wrap; gap: .6rem; }
button { cursor: pointer; color: #e5fbff; background: #12374b; border: 1px solid #3bafc5; border-radius: 9px 3px 9px 9px; padding: .6rem .8rem; font: inherit; }
button:disabled { opacity: .65; cursor: wait; }
button:focus-visible { outline: 2px solid #b7f5ff; outline-offset: 3px; }
select { display: block; width: 100%; max-width: 100%; padding: .6rem; color: #e5fbff; background: #12374b; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.erro { color: #ffbdad; }
</style>
