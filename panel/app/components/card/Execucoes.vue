<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import type { CardView, RunView } from '#shared/types'
import { runCostLabel, runFloorReason } from '#shared/cost-floor'
import { fmtDt, fmtTime } from '../../composables/useFormat'
import { STEP_LIST } from '../../composables/usePhases'
import { useCardResumo } from '../../composables/useCardResumo'

interface CardExecucoesProps {
  card: CardView
  runs: RunView[]
}

const props = defineProps<CardExecucoesProps>()

const cardRef = toRef(props, 'card')
const runsRef = computed(() => props.runs)
const { execucoes, ultimaExecucao, custoMotivo } = useCardResumo(cardRef, runsRef)

const todas = ref(false)

function numero(valor: number | undefined): string {
  return Number(valor || 0).toLocaleString('pt-BR')
}

function moeda(valor: number | undefined): string {
  return `$${Number(valor || 0).toFixed(4)}`
}
</script>

<template>
  <div v-if="execucoes.length" class="execs">
    <BaseBotao variante="texto" tamanho="sm" @click="todas = !todas">
      {{ todas ? '▾' : '▸' }} gasto · {{ execucoes.length }} execuç{{ execucoes.length === 1 ? 'ão' : 'ões' }}
    </BaseBotao>

    <p v-if="custoMotivo" class="nota">{{ custoMotivo }}</p>

    <div v-if="!todas && ultimaExecucao" class="exec">
      <span class="quando">execução atual · {{ fmtDt(ultimaExecucao.ts) }}</span>
      <div class="valores">
        <BaseValor :valor="fmtTime(ultimaExecucao.duration_s)" rotulo="tempo" tom="atencao" />
        <BaseValor
          :valor="runCostLabel(ultimaExecucao)"
          rotulo="valor"
          tom="ok"
          :estimado="ultimaExecucao.cost_measured === false"
          :motivo="runFloorReason(ultimaExecucao)"
        />
        <BaseValor :valor="numero(ultimaExecucao.tokens_total)" rotulo="tokens" tom="acento" />
      </div>
    </div>

    <div v-for="(r, i) in (todas ? execucoes : [])" :key="i" class="exec">
      <span class="quando">#{{ i + 1 }} · {{ fmtDt(r.ts) }}</span>
      <table v-if="r.steps" class="tabela">
        <thead>
          <tr><th>step</th><th>tempo</th><th>valor</th><th>tokens</th></tr>
        </thead>
        <tbody>
          <tr v-for="st in STEP_LIST" :key="st.k">
            <td class="nome">{{ st.l }}</td>
            <td>{{ fmtTime(r.steps[st.k]?.time) }}</td>
            <td>{{ moeda(r.steps[st.k]?.cost) }}</td>
            <td>{{ numero(r.steps[st.k]?.tokens) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="valores">
        <BaseValor :valor="fmtTime(r.duration_s)" rotulo="tempo" tom="atencao" />
        <BaseValor :valor="runCostLabel(r)" rotulo="valor" tom="ok" :estimado="r.cost_measured === false" :motivo="runFloorReason(r)" />
        <BaseValor :valor="numero(r.tokens_total)" rotulo="tokens" tom="acento" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.execs {
  display: flex;
  flex-direction: column;
  gap: var(--esp-2);
  align-items: flex-start;
  padding-top: var(--esp-3);
  border-top: 1px solid var(--hairline-fraca);
}

.nota { margin: 0; font-family: var(--fonte-mono); font-size: var(--tf-mini); color: var(--atencao); word-break: break-word; }

.exec {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: var(--esp-2);
  padding: var(--esp-3);
  background: var(--superficie-afundada);
  border: 1px solid var(--hairline);
  border-radius: var(--raio-2);
}

.quando { font-family: var(--fonte-mono); font-size: var(--tf-mini); color: var(--texto-fraco); }

.valores { display: flex; gap: var(--esp-5); flex-wrap: wrap; }

.tabela { width: 100%; border-collapse: collapse; font-family: var(--fonte-mono); font-size: var(--tf-mini); }

.tabela th {
  text-align: right;
  padding: var(--esp-1) var(--esp-2);
  color: var(--texto-fraco);
  font-size: var(--tf-micro);
  letter-spacing: var(--tracking-rotulo);
  text-transform: uppercase;
  border-bottom: 1px solid var(--hairline);
}

.tabela th:first-child { text-align: left; }

.tabela td {
  text-align: right;
  padding: var(--esp-1) var(--esp-2);
  color: var(--texto);
  border-bottom: 1px solid var(--hairline-fraca);
  font-variant-numeric: tabular-nums;
}

.tabela td.nome { text-align: left; color: var(--texto-mudo); }
.tabela tr:last-child td { border-bottom: none; }
</style>
