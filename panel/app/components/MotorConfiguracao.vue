<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ConfiguracaoDoPainel, PapelHii } from '#shared/configuracao-hii'
import { motivoDeInelegibilidade, rotuloDeCapacidade, rotuloDeCarga, rotuloDeIdentidade, rotuloDeLocalidade } from '#shared/configuracao-hii'
const dados = ref<ConfiguracaoDoPainel | null>(null)
const papel = ref<PapelHii>('implement')
const provider = ref('')
const model = ref('')
const modoRevisao = ref<'nao-configurado' | 'humana' | 'automatica'>('nao-configurado')
const ocupado = ref(false)
const aviso = ref('')
const conflito = ref(false)
const intencao = ref<{ papel: PapelHii; provider: string; model: string; autoReview?: boolean; etag: string; chave: string } | null>(null)
const atual = computed(() => dados.value?.configuracao?.preferencias[papel.value])
const escolhido = computed(() => dados.value?.provedores.find(p => p.nome === provider.value))
const recusa = computed(() => escolhido.value ? motivoDeInelegibilidade(escolhido.value, papel.value) : 'Escolha um provedor')
async function carregar(): Promise<void> {
  ocupado.value = true
  try {
    dados.value = await $fetch<ConfiguracaoDoPainel>('/api/hii/configuracao')
    if (conflito.value) {
      aviso.value = 'Configuracao atual relida. Compare com sua proposta abaixo e confirme uma nova gravacao.'
      conflito.value = false
      intencao.value = null
    }
  } catch { aviso.value = 'Nao foi possivel consultar a configuracao. Confira permissao e conexao.' }
  finally { ocupado.value = false }
}
async function salvar(): Promise<void> {
  if (ocupado.value || conflito.value || !dados.value?.escrita || recusa.value) return
  const proposta = { papel: papel.value, provider: provider.value, model: model.value,
    ...(papel.value === 'gate' && modoRevisao.value !== 'nao-configurado' ? { autoReview: modoRevisao.value === 'automatica' } : {}), etag: dados.value.etag }
  if (intencao.value && JSON.stringify(proposta) !== JSON.stringify({ papel: intencao.value.papel, provider: intencao.value.provider, model: intencao.value.model, ...(intencao.value.autoReview !== undefined ? { autoReview: intencao.value.autoReview } : {}), etag: intencao.value.etag })) {
    aviso.value = 'Reenvie a proposta anterior para reconciliar sua gravacao antes de alterar os campos.'
    return
  }
  intencao.value ??= { ...proposta, chave: crypto.randomUUID() }
  ocupado.value = true
  try {
    await $fetch('/api/hii/configuracao', { method: 'POST', body: intencao.value })
    intencao.value = null
    aviso.value = 'Preferencia salva para os proximos despachos.'
    await carregar()
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    conflito.value = status === 412
    const recusada = status !== undefined && [400, 401, 403, 409, 428].includes(status)
    if (recusada) intencao.value = null
    aviso.value = conflito.value ? 'Outra gravacao alterou a configuracao. Releia e compare; sua proposta foi preservada.'
      : recusada ? 'Motor recusou a proposta. Confira os campos e a permissao antes de tentar novamente.'
      : 'Gravacao sem confirmacao. Repita a mesma proposta para reconciliar.'
  } finally { ocupado.value = false }
}
onMounted(() => { void carregar() })
</script>
<template>
  <details class="configuracao">
    <summary>Provedores e modelos</summary>
    <p v-if="aviso" role="status">{{ aviso }}</p>
    <p v-if="dados?.motivo">{{ dados.motivo }}</p>
    <template v-if="dados?.disponivel">
      <p>{{ dados.configuracao?.aplicacao }}</p>
      <p v-if="dados.configuracao?.execucao">Execucao: {{ dados.configuracao.execucao.localidade }} · fallback remoto {{ dados.configuracao.execucao.fallbackRemoto ? 'ligado' : 'desligado' }} · politica administrada pelo motor.</p>
      <p v-else>Este motor ainda nao informa sua politica de localidade.</p>
      <form @submit.prevent="salvar">
        <label>Papel<select v-model="papel" :disabled="ocupado || !!intencao"><option>implement</option><option>step</option><option>verify</option><option>gate</option></select></label>
        <p>Preferencia atual: {{ atual?.provider || 'padrao do motor' }} / {{ atual?.model || 'modelo padrao' }}</p>
        <label>Provedor<select v-model="provider" :disabled="ocupado || !!intencao"><option value="">Selecione</option><option v-for="p in dados.provedores" :key="p.nome" :value="p.nome" :disabled="!!motivoDeInelegibilidade(p, papel)">{{ p.nome }} · {{ motivoDeInelegibilidade(p, papel) || p.situacao }}</option></select></label>
        <label>Modelo<input v-model="model" list="modelos-hii" :disabled="ocupado || !!intencao" maxlength="200" placeholder="Padrao do provedor"><datalist id="modelos-hii"><option v-for="m in escolhido?.modelos || []" :key="m" :value="m" /></datalist></label>
        <label v-if="papel === 'gate'">Revisao do PR<select v-model="modoRevisao" :disabled="ocupado || !!intencao"><option value="nao-configurado">Perguntar / manter escolha atual</option><option value="humana">Revisao humana</option><option value="automatica" :disabled="!atual?.revisao">Auto review (exige politica)</option></select></label>
        <p v-if="papel === 'gate'">Atual: {{ atual?.autoReview === true ? 'auto review' : atual?.autoReview === false ? 'revisao humana' : 'ainda nao escolhida' }}. O merge permanece humano.</p>
        <p v-if="escolhido">{{ rotuloDeLocalidade(escolhido) }}. {{ escolhido.comoObter }}</p>
        <p v-if="escolhido?.inferencia">Capacidade: {{ rotuloDeCapacidade(escolhido) }}</p>
        <p v-if="escolhido?.identidadeInferencia">Identidade: {{ rotuloDeIdentidade(escolhido) }}</p>
        <p v-if="escolhido?.identidadeInferencia">Carga: {{ rotuloDeCarga(escolhido) }}</p>
        <p v-if="recusa" id="recusa-config">{{ recusa }}</p>
        <button :disabled="ocupado || !dados.escrita || !!recusa || conflito" aria-describedby="recusa-config">Salvar preferencia</button>
        <button type="button" :disabled="ocupado || (!!intencao && !conflito)" @click="carregar">Reler configuracao</button>
      </form>
    </template>
  </details>
</template>
<style scoped>
.configuracao{border:1px solid var(--hairline-forte);border-radius:8px;padding:16px;margin-bottom:20px}summary{cursor:pointer;font-weight:600}form{display:flex;flex-wrap:wrap;gap:16px;align-items:end}label{display:flex;flex-direction:column;gap:8px;min-width:180px}p{flex-basis:100%;font-size:13px;overflow-wrap:anywhere}input,select,button{font:inherit;padding:10px;background:transparent;color:inherit;border:1px solid var(--hairline-forte);border-radius:5px}option{color:var(--texto);background:var(--superficie)}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}input:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid var(--acento);outline-offset:3px}@media(max-width:600px){label{width:100%;min-width:0}input,select{max-width:100%}}
</style>
