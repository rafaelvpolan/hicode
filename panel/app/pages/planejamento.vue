<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CAMPOS_DESCOBERTA, novaDescoberta, pendenciasDaDescoberta, proporEpico, validarPlanejamento } from '#shared/planejamento'
import type { Planejamento, RevisaoDePlanejamento, ErroDePlanejamento } from '#shared/planejamento'
definePageMeta({ layout: false })
const route = useRoute()
const id = String(route.query.id || 'principal')
const documento = ref<Planejamento>({ versao: 1, id, repo: '', descoberta: novaDescoberta(), epico: null })
const revisao = ref(0)
const aprovada = ref(false)
const habilitado = ref(false)
const ocupado = ref(false)
const aviso = ref('')
const erros = ref<ErroDePlanejamento[]>([])
const pendente = ref<{ documento: Planejamento; revisao: number; chave: string; aprovar: boolean } | null>(null)
const pendencias = computed(() => pendenciasDaDescoberta(documento.value.descoberta))
const mensagem = (campo: string): string => erros.value.find(e => e.campo === campo)?.mensagem || ''
function aceitar(r: RevisaoDePlanejamento): void {
  documento.value = r.documento
  revisao.value = r.revisao
  aprovada.value = r.descobertaAprovada
}
async function carregar(): Promise<void> {
  ocupado.value = true
  try {
    const r = await $fetch<{ habilitado: boolean; repo: string; planejamento: RevisaoDePlanejamento | null }>('/api/hii/planejamento', { query: { id } })
    habilitado.value = r.habilitado
    documento.value.repo = r.repo
    if (r.planejamento) aceitar(r.planejamento)
    aviso.value = r.habilitado ? 'Rascunho pronto para revisao.' : 'Habilite este projeto em HICODE_DISCOVERY_REPOS para iniciar a descoberta.'
  } catch { aviso.value = 'Entre na pagina Motor e confira a permissao de acesso antes de abrir o planejamento.' }
  finally { ocupado.value = false }
}
async function salvar(aprovar: boolean): Promise<void> {
  if (ocupado.value || !habilitado.value) return
  erros.value = validarPlanejamento(documento.value, aprovar)
  if (erros.value.length) { aviso.value = 'Revise os campos indicados.'; return }
  pendente.value ??= { documento: structuredClone(JSON.parse(JSON.stringify(documento.value)) as Planejamento), revisao: revisao.value, chave: crypto.randomUUID(), aprovar }
  ocupado.value = true
  try {
    const r = await $fetch<RevisaoDePlanejamento>('/api/hii/planejamento', { method: 'POST', body: pendente.value })
    aceitar(r); pendente.value = null
    aviso.value = aprovar ? 'Sintese aprovada. Agora voce pode preparar o epico.' : 'Revisao salva. Nenhuma execucao foi criada.'
  } catch (e) {
    const erro = e as { statusCode?: number; data?: { data?: { campos?: ErroDePlanejamento[] } } }
    erros.value = erro.data?.data?.campos || []
    if (erro.statusCode && [400, 403, 409, 412].includes(erro.statusCode)) pendente.value = null
    aviso.value = erro.statusCode === 412 ? 'Outro editor salvou uma revisao. Sua proposta foi preservada; copie o conteudo antes de reler e comparar.'
      : 'Salvamento nao confirmado. Se a rede falhou, repita a mesma intencao.'
  } finally { ocupado.value = false }
}
function prepararEpico(): void {
  if (aprovada.value && !pendente.value) documento.value.epico = proporEpico(documento.value.descoberta)
}
function alterarDescoberta(): void { aprovada.value = false }
onMounted(() => { void carregar() })
</script>
<template>
  <main class="planejamento">
    <nav><NuxtLink to="/motor">Motor</NuxtLink> / descoberta e planejamento</nav>
    <header><p class="eyebrow">PRODUTO · REVISAO HUMANA</p><h1>Da dor ao resultado</h1><p>{{ documento.repo }} · revisao {{ revisao }} · {{ aprovada ? 'sintese aprovada' : 'rascunho' }}</p></header>
    <p role="status" class="aviso">{{ aviso }}</p>
    <template v-if="habilitado">
      <section>
        <h2>Descoberta</h2>
        <p>Registre fatos informados e suas fontes. Hipoteses permanecem separadas; informacao ausente vira pergunta, nunca pesquisa inventada.</p>
        <fieldset :disabled="ocupado || !!pendente">
          <label for="desc-titulo">Nome da demanda<input id="desc-titulo" v-model="documento.descoberta.titulo" :aria-invalid="!!mensagem('titulo')" aria-describedby="erro-titulo" @input="alterarDescoberta"><small id="erro-titulo">{{ mensagem('titulo') }}</small></label>
          <div class="grade"><label v-for="(pergunta, campo) in CAMPOS_DESCOBERTA" :key="campo" :for="'desc-' + campo">{{ pergunta }}<textarea :id="'desc-' + campo" v-model="documento.descoberta.respostas[campo]" rows="3" :aria-invalid="!!mensagem(campo)" :aria-describedby="'erro-' + campo" @input="alterarDescoberta" /><small :id="'erro-' + campo">{{ mensagem(campo) }}</small></label></div>
          <label for="desc-decisoes">Decisoes humanas e justificativas<textarea id="desc-decisoes" v-model="documento.descoberta.decisoes" rows="3" @input="alterarDescoberta" /></label>
        </fieldset>
        <details v-if="pendencias.length"><summary>{{ pendencias.length }} pontos a esclarecer antes da aprovacao</summary><ul><li v-for="p in pendencias" :key="p.campo">{{ p.mensagem }}</li></ul></details>
        <div class="acoes"><button :disabled="ocupado" @click="salvar(false)">{{ pendente ? 'Repetir salvamento pendente' : 'Salvar rascunho' }}</button><button :disabled="ocupado || !!pendente || !!pendencias.length" @click="salvar(true)">Aprovar sintese</button><button :disabled="ocupado || !!pendente || !aprovada || !!documento.epico" @click="prepararEpico">Preparar epico</button></div>
      </section>
      <PlanejamentoEpico v-if="documento.epico" :epico="documento.epico" :bloqueado="ocupado || !!pendente" />
      <ul v-if="erros.some(e => e.campo.startsWith('epico') || e.campo.startsWith('tarefas'))" role="alert"><li v-for="e in erros" :key="e.campo">{{ e.campo }}: {{ e.mensagem }}</li></ul>
      <div v-if="documento.epico" class="acoes"><button :disabled="ocupado" @click="salvar(false)">Salvar epico e tarefas</button><p>Salvar a proposta nao conclui criterios nem despacha tarefas. Consulte as evidencias abaixo.</p></div>
      <section v-if="documento.epico && revisao > 0"><h2>Cards tecnicos</h2><p>Salve o epico antes de detalhar as tarefas.</p><ul><li v-for="t in documento.epico.tarefas" :key="t.id"><NuxtLink :to="{ path: '/tecnico', query: { planejamento: id, produto: t.id } }">{{ t.titulo }} — detalhar e revisar</NuxtLink></li></ul></section>
      <PlanejamentoProgresso v-if="documento.epico && revisao > 0" :planejamento="id" :revisao="revisao" />
      <details><summary>Documento da proposta para comparacao</summary><pre>{{ JSON.stringify(documento, null, 2) }}</pre><button :disabled="ocupado || !!pendente" @click="carregar">Reler revisao salva</button></details>
    </template>
  </main>
</template>
<style scoped>
.planejamento{max-width:1100px;margin:auto;padding:24px;overflow-wrap:anywhere}header{margin:32px 0}h1{font-size:32px}.eyebrow{font:12px monospace;letter-spacing:.08em}.aviso{padding:16px;border-left:3px solid var(--acento);background:var(--acento-veu)}section{margin:28px 0}fieldset{border:0;padding:0}.grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}label{display:flex;flex-direction:column;gap:8px;margin:12px 0;font-size:14px}input,textarea,button{font:inherit;padding:10px;background:transparent;color:inherit;border:1px solid var(--hairline-forte);border-radius:5px}small{color:var(--atencao)}.acoes{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:20px 0}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}pre{white-space:pre-wrap;font:12px/1.6 monospace;border:1px solid var(--hairline-forte);padding:16px;max-height:400px;overflow:auto}input:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid var(--acento);outline-offset:3px}@media(max-width:600px){.grade{grid-template-columns:1fr}h1{font-size:28px}}
</style>
