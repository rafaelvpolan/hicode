<script setup lang="ts">
import { computed } from 'vue'
import type { LeituraDeCota } from '#shared/types'

interface CustoResumoProps {
  custoTotalUsd: number
  quota: LeituraDeCota
}

const props = defineProps<CustoResumoProps>()

const custoTotal = computed<string>(() => `$${props.custoTotalUsd.toFixed(2)}`)
const custoDaJanela = computed<string>(() => `$${props.quota.custoUsd.toFixed(2)}`)
const tokensDaJanela = computed<string>(() => props.quota.tokens.toLocaleString('pt-BR'))
const runsDaJanela = computed<string>(() => String(props.quota.runs))
</script>

<template>
  <BasePainel>
    <BaseCabecalhoSecao rotulo="custo" titulo="Quanto o loop gastou" descricao="valor consolidado dos cards e da janela de cota corrente" />
    <BaseGrade minimo="180px" espaco="5">
      <BaseKpi :valor="custoTotal" rotulo="custo total" tom="acento" tamanho="lg" />
      <BaseKpi :valor="custoDaJanela" rotulo="na janela" tom="ok" />
      <BaseKpi :valor="tokensDaJanela" rotulo="tokens na janela" />
      <BaseKpi :valor="runsDaJanela" rotulo="execuções na janela" :nota="quota.runsIgnorados ? `${quota.runsIgnorados} ignorada(s)` : ''" />
    </BaseGrade>
  </BasePainel>
</template>
