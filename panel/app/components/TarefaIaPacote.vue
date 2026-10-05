<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

interface IaDoPapel { papel: 'implement' | 'verify' | 'gate' | 'step'; provedor: string; modelo: string }
interface Recurso<T> { valor: T; etag: string }
interface Pacote { hash: string | null; status: string | null; resumo: string | null; markdown: string }
interface RespostaPacote { ia: Recurso<{ ias: IaDoPapel[] }>; pacote: Recurso<Pacote> }
interface Configuracao { configuracao?: { limites?: { tetoUsdPorCard: number; tetoTokensPorCard: number; avisoDeCotaPct: number } }; provedores: { nome: string; aptidao?: { agentic: boolean; isolatesReadonly: boolean; emitsStructuredJson: boolean } }[] }

const props = defineProps<{ id: string; revisao?: string }>()
const emit = defineEmits<{ aprovar: []; alterado: [] }>()

const ias = ref<IaDoPapel[]>([])
const etagIa = ref('')
const pacote = ref<Pacote | null>(null)
const provedores = ref<Configuracao['provedores']>([])
const limites = ref<NonNullable<Configuracao['configuracao']>['limites']>()
const erro = ref('')
const ocupado = ref(false)
const modeloImplementacao = ref('')
const modeloAlterado = ref(false)
let leitura = 0

const ROTULO: Record<IaDoPapel['papel'], string> = { implement: 'Implementa', verify: 'Verifica', gate: 'Revisa (crivo)', step: 'Passos do pipeline' }

function apto(papel: IaDoPapel['papel'], nome: string): boolean {
  const a = provedores.value.find(p => p.nome === nome)?.aptidao
  if (!a) return true
  if (papel === 'implement') return a.agentic
  if (papel === 'gate' || papel === 'verify') return a.isolatesReadonly && a.emitsStructuredJson
  return true
}

async function carregar(): Promise<void> {
  const atual = ++leitura
  try {
    const [r, c] = await Promise.all([
      $fetch<RespostaPacote>('/api/hii/pacote', { query: { id: props.id } }),
      $fetch<Configuracao>('/api/hii/configuracao'),
    ])
    if (atual !== leitura) return
    ias.value = r.ia.valor.ias
    if (!modeloAlterado.value) modeloImplementacao.value = r.ia.valor.ias.find(ia => ia.papel === 'implement')?.modelo || ''
    etagIa.value = r.ia.etag
    pacote.value = r.pacote.valor
    provedores.value = c.provedores
    limites.value = c.configuracao?.limites
    erro.value = ''
  } catch { if (atual !== leitura) return; erro.value = 'Nao foi possivel ler a IA e o pacote desta tarefa pela API do HII.' }
}

async function definir(papel: IaDoPapel['papel'], provedor: string, modelo = ''): Promise<void> {
  if (ocupado.value) return
  ocupado.value = true
  if (papel === 'implement') { modeloAlterado.value = true; modeloImplementacao.value = modelo }
  try {
    await $fetch('/api/hii/comando', { method: 'POST', body: { acao: 'definir-ia', id: props.id, papel, provedor, modelo, etag: etagIa.value, chave: `hicode-ia-${crypto.randomUUID()}` } })
    if (papel === 'implement') modeloAlterado.value = false
    await carregar()
    emit('alterado')
  } catch { erro.value = 'O motor recusou a troca de IA (tarefa mudou ou IA sem capacidade para o papel). Recarregue e tente de novo.' }
  finally { ocupado.value = false }
}

onMounted(carregar)
watch(() => props.id, () => { modeloAlterado.value = false; modeloImplementacao.value = ''; void carregar() })
watch(() => props.revisao, carregar)
</script>

<template>
  <section class="ia-pacote" aria-label="IA e pacote da tarefa">
    <h4>IA desta tarefa</h4>
    <p v-if="limites" class="resumo">Limite por execucao: US$ {{ limites.tetoUsdPorCard }} · {{ limites.tetoTokensPorCard || 'sem teto de' }} tokens. Aviso de cota em {{ limites.avisoDeCotaPct }}%.</p>
    <p class="dica">O motor pede confirmacao antes de trocar de provedor. Custos nao informados pelo executor permanecem desconhecidos; o teto de tokens continua aplicado.</p>
    <p v-if="erro" class="alerta">{{ erro }}</p>
    <div class="papeis">
      <div v-for="ia in ias" :key="ia.papel" class="papel">
        <label :for="`provedor-${ia.papel}`">{{ ROTULO[ia.papel] }}</label>
        <select :id="`provedor-${ia.papel}`" :value="ia.provedor" :disabled="ocupado" @change="definir(ia.papel, ($event.target as HTMLSelectElement).value)">
          <option value="">padrao do motor</option>
          <option v-for="p in provedores" :key="p.nome" :value="p.nome" :disabled="!apto(ia.papel, p.nome)">{{ p.nome }}{{ apto(ia.papel, p.nome) ? '' : ' (sem capacidade)' }}</option>
        </select>
        <template v-if="ia.papel === 'implement'">
          <input v-model="modeloImplementacao" @input="modeloAlterado = true" :disabled="ocupado" aria-label="Modelo que implementa" placeholder="Modelo padrao do provedor" maxlength="200">
          <button type="button" :disabled="ocupado" @click="definir(ia.papel, ia.provedor, modeloImplementacao)">Aplicar modelo</button>
        </template>
      </div>
    </div>
    <template v-if="pacote && pacote.status === 'aguardando'">
      <h4>Pacote de execucao aguardando aprovacao</h4>
      <p class="resumo">{{ pacote.resumo }}</p>
      <details open>
        <summary>Prompt e recomendacoes completos</summary>
        <pre class="markdown">{{ pacote.markdown }}</pre>
      </details>
      <button :disabled="ocupado || modeloAlterado" @click="emit('aprovar')">Aprovar e executar</button>
      <p v-if="modeloAlterado" class="dica">Aplique o modelo para gerar o pacote atualizado antes de aprovar.</p>
      <p class="dica">Para ajustar, escreva a instrucao no campo de pedido e use Responder. Nenhuma IA roda antes da aprovacao.</p>
    </template>
    <p v-else-if="pacote && pacote.status" class="resumo">Pacote {{ pacote.status }}{{ pacote.hash ? ` (${pacote.hash})` : '' }}.</p>
  </section>
</template>

<style scoped>
.ia-pacote{border:1px solid var(--hairline);border-radius:8px;padding:16px;margin-top:20px}
.papeis{display:flex;flex-wrap:wrap;gap:12px}
.papeis .papel{min-width:160px;display:flex;flex-direction:column;gap:8px}
.papeis input,.papeis select{max-width:100%;font:inherit;padding:8px;border:1px solid var(--hairline-forte);border-radius:5px;background:var(--superficie);color:var(--texto)}
.resumo,.dica{font-size:13px;color:var(--texto-mudo);overflow-wrap:anywhere}
.markdown{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 monospace;max-height:360px;overflow:auto;padding:12px;border:1px solid var(--hairline);border-radius:5px}
.alerta{border-left:3px solid var(--atencao);padding:12px}
h4{font-size:14px;margin:8px 0}
</style>
