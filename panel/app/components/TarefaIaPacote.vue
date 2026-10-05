<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

interface IaDoPapel { papel: 'implement' | 'verify' | 'gate' | 'step'; provedor: string; modelo: string }
interface Recurso<T> { valor: T; etag: string }
interface Pacote { hash: string | null; status: string | null; resumo: string | null; markdown: string }
interface RespostaPacote { ia: Recurso<{ ias: IaDoPapel[] }>; pacote: Recurso<Pacote> }
interface Configuracao { provedores: { nome: string; aptidao?: { agentic: boolean; isolatesReadonly: boolean; emitsStructuredJson: boolean } }[] }

const props = defineProps<{ id: string }>()
const emit = defineEmits<{ aprovar: []; alterado: [] }>()

const ias = ref<IaDoPapel[]>([])
const etagIa = ref('')
const pacote = ref<Pacote | null>(null)
const provedores = ref<Configuracao['provedores']>([])
const erro = ref('')
const ocupado = ref(false)

const ROTULO: Record<IaDoPapel['papel'], string> = { implement: 'Implementa', verify: 'Verifica', gate: 'Revisa (crivo)', step: 'Passos do pipeline' }

function apto(papel: IaDoPapel['papel'], nome: string): boolean {
  const a = provedores.value.find(p => p.nome === nome)?.aptidao
  if (!a) return true
  if (papel === 'implement') return a.agentic
  if (papel === 'gate' || papel === 'verify') return a.isolatesReadonly && a.emitsStructuredJson
  return true
}

async function carregar(): Promise<void> {
  try {
    const [r, c] = await Promise.all([
      $fetch<RespostaPacote>('/api/hii/pacote', { query: { id: props.id } }),
      $fetch<Configuracao>('/api/hii/configuracao'),
    ])
    ias.value = r.ia.valor.ias
    etagIa.value = r.ia.etag
    pacote.value = r.pacote.valor
    provedores.value = c.provedores
    erro.value = ''
  } catch { erro.value = 'Nao foi possivel ler a IA e o pacote desta tarefa pela API do HII.' }
}

async function definir(papel: IaDoPapel['papel'], provedor: string): Promise<void> {
  if (ocupado.value) return
  ocupado.value = true
  try {
    await $fetch('/api/hii/comando', { method: 'POST', body: { acao: 'definir-ia', id: props.id, papel, provedor, etag: etagIa.value, chave: `hicode-ia-${crypto.randomUUID()}` } })
    await carregar()
    emit('alterado')
  } catch { erro.value = 'O motor recusou a troca de IA (tarefa mudou ou IA sem capacidade para o papel). Recarregue e tente de novo.' }
  finally { ocupado.value = false }
}

onMounted(carregar)
watch(() => props.id, carregar)
</script>

<template>
  <section class="ia-pacote" aria-label="IA e pacote da tarefa">
    <h4>IA desta tarefa</h4>
    <p v-if="erro" class="alerta">{{ erro }}</p>
    <div class="papeis">
      <label v-for="ia in ias" :key="ia.papel">
        {{ ROTULO[ia.papel] }}
        <select :value="ia.provedor" :disabled="ocupado" @change="definir(ia.papel, ($event.target as HTMLSelectElement).value)">
          <option value="">padrao do motor</option>
          <option v-for="p in provedores" :key="p.nome" :value="p.nome" :disabled="!apto(ia.papel, p.nome)">{{ p.nome }}{{ apto(ia.papel, p.nome) ? '' : ' (sem capacidade)' }}</option>
        </select>
      </label>
    </div>
    <template v-if="pacote && pacote.status === 'aguardando'">
      <h4>Pacote de execucao aguardando aprovacao</h4>
      <p class="resumo">{{ pacote.resumo }}</p>
      <details>
        <summary>Prompt e recomendacoes completos</summary>
        <pre class="markdown">{{ pacote.markdown }}</pre>
      </details>
      <button :disabled="ocupado" @click="emit('aprovar')">Aprovar e executar</button>
      <p class="dica">Para ajustar, escreva a instrucao no campo de pedido e use Responder. Nenhuma IA roda antes da aprovacao.</p>
    </template>
    <p v-else-if="pacote && pacote.status" class="resumo">Pacote {{ pacote.status }}{{ pacote.hash ? ` (${pacote.hash})` : '' }}.</p>
  </section>
</template>

<style scoped>
.ia-pacote{border:1px solid var(--hairline);border-radius:8px;padding:16px;margin-top:20px}
.papeis{display:flex;flex-wrap:wrap;gap:12px}
.papeis label{min-width:160px}
.resumo,.dica{font-size:13px;color:var(--texto-mudo);overflow-wrap:anywhere}
.markdown{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 monospace;max-height:360px;overflow:auto;padding:12px;border:1px solid var(--hairline);border-radius:5px}
.alerta{border-left:3px solid var(--atencao);padding:12px}
h4{font-size:14px;margin:8px 0}
</style>
