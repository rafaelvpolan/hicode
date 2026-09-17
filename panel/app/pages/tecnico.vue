<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { analisarTecnico } from '#shared/contrato-tecnico'
import type { AvaliacaoDeExecucao } from '#shared/avaliacao-hii'
import type { RevisaoTecnica } from '#shared/tecnico'
definePageMeta({ layout: false })
const route = useRoute()
const planejamento = String(route.query.planejamento || '')
const produto = String(route.query.produto || '')
const fonte = ref('')
const revisao = ref(0)
const salva = ref('')
const aprovada = ref(false)
const disponivel = ref(false)
const ocupado = ref(false)
const aviso = ref('')
const avaliacao = ref<AvaliacaoDeExecucao | null>(null)
const verificando = ref(false)
const avisoEvidencia = ref('')
const envio = ref<RevisaoTecnica['envio']>(null)
const pendente = ref<{ planejamento: string; produto: string; acao: string; fonte: string; revisao: number; chave: string; aprovar: boolean } | null>(null)
const analise = computed(() => analisarTecnico(fonte.value))
const alterada = computed(() => fonte.value !== salva.value)
function aceitar(r: RevisaoTecnica): void {
  avaliacao.value = null; avisoEvidencia.value = '';
  fonte.value = r.fonte; salva.value = r.fonte; revisao.value = r.revisao
  aprovada.value = r.aprovada; envio.value = r.envio
}
async function carregar(): Promise<void> {
  ocupado.value = true
  try {
    const r = await $fetch<{ revisao: RevisaoTecnica | null; modelo: string; despachoDisponivel: boolean }>('/api/hii/tecnico', { query: { planejamento, produto } })
    disponivel.value = r.despachoDisponivel
    if (r.revisao) aceitar(r.revisao)
    else { fonte.value = r.modelo; salva.value = r.modelo }
    aviso.value = 'Complete os campos, salve e aprove a revisao antes de despachar.'
  } catch (e) { aviso.value = (e as { statusMessage?: string }).statusMessage || 'Abra o Motor e confira permissao e planejamento aprovado.' }
  finally { ocupado.value = false }
}
async function salvar(aprovar: boolean): Promise<void> {
  if (ocupado.value) return
  pendente.value ??= { planejamento, produto, acao: 'salvar', fonte: fonte.value, revisao: revisao.value, chave: crypto.randomUUID(), aprovar }
  ocupado.value = true
  try {
    aceitar(await $fetch<RevisaoTecnica>('/api/hii/tecnico', { method: 'POST', body: pendente.value }))
    pendente.value = null
    aviso.value = aprovar ? 'Revisao aprovada. Despacho e uma acao separada.' : 'Nova revisao salva; aprovacao anterior nao se aplica a ela.'
  } catch (e) {
    const erro = e as { statusCode?: number; statusMessage?: string }
    if (erro.statusCode && [400, 403, 409, 412].includes(erro.statusCode)) pendente.value = null
    aviso.value = erro.statusMessage || 'Gravacao sem confirmacao. Repita a mesma intencao.'
  } finally { ocupado.value = false }
}
async function despachar(): Promise<void> {
  if (ocupado.value || alterada.value || !aprovada.value || !disponivel.value) return
  ocupado.value = true
  try {
    aceitar(await $fetch<RevisaoTecnica>('/api/hii/tecnico', { method: 'POST', body: { planejamento, produto, acao: 'despachar', revisao: revisao.value } }))
    aviso.value = `Execucao #${envio.value?.execucao} recebida pelo motor: ${envio.value?.status}. A conclusao depende das evidencias e gates.`
  } catch (e) { aviso.value = (e as { statusMessage?: string }).statusMessage || 'Envio sem confirmacao. Repetir reconcilia a mesma execucao.' }
  finally { ocupado.value = false }
}
async function conferirEvidencias(): Promise<void> {
  const execucao = envio.value?.execucao
  if (!execucao || verificando.value) return
  verificando.value = true
  avaliacao.value = null
  try {
    const a = await $fetch<AvaliacaoDeExecucao>('/api/hii/avaliacao', { query: { execucao } })
    if (envio.value?.execucao === execucao) avaliacao.value = a
    avisoEvidencia.value = 'Consulta concluida; estado da execucao nao substitui os criterios.'
  } catch (e) { avisoEvidencia.value = (e as { statusMessage?: string }).statusMessage || 'Evidencia indisponivel.' }
  finally { verificando.value = false }
}
onMounted(() => { void carregar() })
</script>
<template>
  <main class="tecnico">
    <nav><NuxtLink :to="'/planejamento?id=' + encodeURIComponent(planejamento)">Planejamento</NuxtLink> / card tecnico</nav>
    <h1>Revisao tecnica da tarefa</h1>
    <p>{{ produto }} · revisao {{ revisao }} · {{ aprovada && !alterada ? 'aprovada' : 'rascunho' }}</p>
    <p role="status">{{ aviso }}</p>
    <p v-if="!disponivel">Despacho indisponivel: o motor precisa anunciar suporte ao documento tecnico v1.</p>
    <label for="documento-tecnico">Documento completo (JSON v1)</label>
    <p id="ajuda-tecnico">Inclua resultado esperado, verificacao, microtarefas, riscos e operacao. Verificadores usam build, test, lint ou typecheck do contrato local; o documento nao executa comandos arbitrarios.</p>
    <textarea id="documento-tecnico" v-model="fonte" :disabled="ocupado || !!pendente" :aria-invalid="!!analise.erros.length" aria-describedby="ajuda-tecnico erros-tecnico linhas-tecnico" spellcheck="false" rows="24" />
    <p id="linhas-tecnico">{{ analise.linhas }} / 500 linhas. Metadados e linhas vazias contam; CRLF equivale a LF. Uma quebra final nao acrescenta linha.</p>
    <ul id="erros-tecnico" aria-live="polite"><li v-for="e in analise.erros" :key="e.campo">{{ e.campo }}: {{ e.mensagem }}</li></ul>
    <PlanoTecnico v-if="analise.documento && !analise.erros.length" :documento="analise.documento" :alterada="alterada" :enviada="envio?.estado === 'confirmado'" />
    <p v-else>A previa do plano fica disponivel apos corrigir os erros do documento.</p>
    <div class="acoes">
      <button :disabled="ocupado || !analise.documento || analise.linhas > 500" @click="salvar(false)">{{ pendente ? 'Reconciliar salvamento' : 'Salvar nova revisao' }}</button>
      <button :disabled="ocupado || !!pendente || !!analise.erros.length" @click="salvar(true)">Aprovar revisao</button>
      <button :disabled="ocupado || !!pendente || alterada || !aprovada || !disponivel" @click="despachar">{{ envio ? 'Consultar/reconciliar envio' : 'Despachar revisao aprovada' }}</button>
      <button :disabled="ocupado || !!pendente || alterada" @click="carregar">Reler revisao salva</button>
    </div>
    <p v-if="envio">Envio {{ envio.estado }} · sessao {{ envio.sessao || 'aguardando' }} · execucao {{ envio.execucao || 'aguardando confirmacao' }}</p>
    <p v-if="envio?.mensagem">{{ envio.mensagem }}</p>
    <section v-if="envio?.execucao"><h2>Evidencias da execucao vinculada</h2><p v-if="alterada">As evidencias pertencem ao documento ja enviado, anterior as edicoes no editor.</p><button :disabled="ocupado || verificando" @click="conferirEvidencias">Consultar evidencias da execucao</button><p role="status">{{ avisoEvidencia }}</p><EvidenciasDaExecucao v-if="avaliacao" :avaliacao="avaliacao" /></section>
    <p v-if="analise.documento?.dependencias.length">O envio exige entrega comprovada das dependencias de produto. Em caso de bloqueio, confira a tarefa indicada e tente novamente.</p>
    <p>Edicoes criam novas revisoes. A execucao existente conserva o documento que recebeu.</p>
  </main>
</template>
<style scoped>
.tecnico{max-width:1100px;margin:auto;padding:24px;overflow-wrap:anywhere}h1{margin-top:28px}textarea{display:block;box-sizing:border-box;width:100%;font:13px/1.5 monospace;white-space:pre;overflow:auto;padding:12px;background:transparent;color:inherit;border:1px solid var(--hairline-forte);border-radius:5px}.acoes{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}button{font:inherit;padding:10px;border:1px solid var(--hairline-forte);border-radius:5px;background:transparent;color:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,textarea:focus-visible{outline:2px solid var(--acento);outline-offset:3px}li{margin:6px 0}label{font-weight:600}@media(max-width:600px){.tecnico{padding:16px}h1{font-size:26px}}
</style>
