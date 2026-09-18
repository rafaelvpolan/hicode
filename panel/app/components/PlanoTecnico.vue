<script setup lang="ts">
import { computed } from 'vue'
import type { DocumentoTecnico, MicrotaskTecnica } from '#shared/contrato-tecnico'
const props = defineProps<{ documento: DocumentoTecnico; alterada: boolean; enviada: boolean }>()
// Mesmo desempate do motor: ondas topologicas, preservando a ordem do documento.
const etapas = computed(() => {
  const feitas = new Set<string>()
  const ordenadas: MicrotaskTecnica[] = []
  while (feitas.size < props.documento.microtasks.length) {
    const prontas = props.documento.microtasks.filter(m => !feitas.has(m.id) && m.dependeDe.every(d => feitas.has(d)))
    if (!prontas.length) return []
    ordenadas.push(...prontas)
    prontas.forEach(m => feitas.add(m.id))
  }
  return ordenadas
})
</script>
<template>
  <section class="plano-tecnico" aria-labelledby="titulo-plano">
    <h2 id="titulo-plano">Plano de execucao para revisao</h2>
    <p v-if="alterada">Previa das edicoes no editor. Salve e aprove uma nova revisao para usa-las.</p>
    <p v-else-if="enviada">Plano do documento enviado. Consulte as evidencias para acompanhar a execucao efetiva.</p>
    <p v-else>Confira esta distribuicao antes de aprovar e despachar.</p>
    <p>O motor executa uma microtarefa por vez, respeitando as dependencias. Papel define a responsabilidade; a IA indicada e uma atribuicao solicitada, sujeita a capacidade e disponibilidade no motor.</p>
    <p v-if="documento.dependencias.length"><strong>Entregas de produto exigidas:</strong> {{ documento.dependencias.join(', ') }}</p>
    <ol class="etapas">
      <li v-for="m in etapas" :key="m.id" :data-microtask="m.id">
        <h3>{{ m.titulo }} <small>({{ m.id }})</small></h3>
        <dl>
          <dt>Papel</dt><dd>{{ m.agente }}</dd>
          <dt>IA solicitada</dt><dd>{{ m.ia?.provedor || 'Selecao pelo motor' }} · {{ m.ia?.modelo || 'Modelo resolvido pelo motor' }}</dd>
          <dt>Depende de</dt><dd>{{ m.dependeDe.join(', ') || 'Nenhuma microtarefa' }}</dd>
          <dt>Saida esperada</dt><dd>{{ m.saida }}</dd>
          <dt>Arquivos previstos</dt><dd>{{ m.arquivos.join(', ') || 'Nao especificados' }}</dd>
        </dl>
        <details><summary>Instrucao e criterios de verificacao</summary>
          <p>{{ m.instrucao }}</p>
          <ul>
            <li v-for="c in documento.criterios.filter(c => m.criterios.includes(c.id))" :key="c.id">
              <strong>{{ c.id }} · {{ c.obrigatorio ? 'Obrigatorio' : 'Opcional' }}</strong>
              <p>{{ c.descricao }}</p><p>Resultado: {{ c.resultado }}</p>
              <p>Verificacao: {{ c.verificacao }} · {{ c.verificador || 'Sem verificador definido' }}</p>
              <p v-if="c.naoAplicavel">Justificativa de dispensa: {{ c.naoAplicavel }}</p>
            </li>
          </ul>
        </details>
      </li>
    </ol>
  </section>
</template>
<style scoped>
.plano-tecnico{margin:24px 0;border:1px solid var(--hairline-forte);border-radius:6px;padding:18px;overflow-wrap:anywhere}
.etapas{padding-left:24px}.etapas>li{padding:4px 0 18px}.etapas>li+li{border-top:1px solid var(--hairline-forte)}
h3{font-size:18px}small{font-weight:400}dl{display:grid;grid-template-columns:170px minmax(0,1fr);gap:8px}dt{font-weight:600}dd{margin:0}summary{cursor:pointer}summary:focus-visible{outline:2px solid var(--acento);outline-offset:3px}
@media(max-width:600px){.plano-tecnico{padding:12px}dl{grid-template-columns:1fr;gap:4px}dd{margin-bottom:8px}}
</style>
