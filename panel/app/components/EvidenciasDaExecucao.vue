<script setup lang="ts">
import type { AvaliacaoDeExecucao } from '#shared/avaliacao-hii'
defineProps<{ avaliacao: AvaliacaoDeExecucao }>()
</script>
<template>
  <section class="evidencias">
    <p>Execucao #{{ avaliacao.execucao }} · {{ avaliacao.status }} · plano {{ avaliacao.plano?.revisao || 'ausente' }}</p>
    <p v-if="avaliacao.entrega">Entrega verificada no PR: {{ avaliacao.entrega.pr }}<br>Commit validado: {{ avaliacao.entrega.head }}<br>Arvore verificada: {{ avaliacao.entrega.tree }}<template v-if="avaliacao.entrega.merge"><br>Commit integrado: {{ avaliacao.entrega.merge }}</template></p>
    <p>Atualidade: {{ avaliacao.atualidade }}. {{ avaliacao.motivo }}</p>
    <p>Consulta: {{ avaliacao.consultadaEm }}<template v-if="avaliacao.evidenciaEm"> · evidencia: {{ avaliacao.evidenciaEm }}</template></p>
    <p v-if="!avaliacao.criterios.length">Nenhum criterio verificavel registrado. Estado terminal nao comprova entrega.</p>
    <article v-for="c in avaliacao.criterios" :key="c.id">
      <h4>{{ c.id }} · {{ c.estado }} · {{ c.obrigatorio ? 'obrigatorio' : 'opcional' }}</h4>
      <p class="descricao">{{ c.descricao }}</p>
      <p v-if="c.resultadoRegistrado && c.resultadoRegistrado !== c.estado">Resultado historico: {{ c.resultadoRegistrado }}. Nao vale como aprovacao atual.</p>
      <details><summary>Ver evidencia de {{ c.id }}</summary><p>Saida {{ c.exitCode === null ? 'desconhecida' : c.exitCode }} · timeout {{ c.timeout ? 'sim' : 'nao' }} · duracao {{ c.duracaoMs === null ? 'desconhecida' : c.duracaoMs + ' ms' }}</p><pre>{{ c.comando.join(' ') }}</pre><pre>{{ c.saida }}</pre></details>
    </article>
  </section>
</template>
<style scoped>
.evidencias{font-size:14px;overflow-wrap:anywhere}article{border-top:1px solid var(--hairline-forte);padding:12px 0}h4{margin:6px 0}.descricao{white-space:pre-wrap}summary{cursor:pointer}pre{white-space:pre-wrap;max-height:260px;overflow:auto;border:1px solid var(--hairline-forte);padding:12px;font:12px/1.5 monospace}details:focus-within{outline:2px solid var(--acento);outline-offset:3px}
</style>
