<script setup lang="ts">
import type { Tom } from '#shared/design'
import type { Kpi } from '#shared/types'

interface KpiBarProps {
  kpis: Kpi[]
}

defineProps<KpiBarProps>()

const TOM_POR_CHAVE: Record<Kpi['k'], Tom> = {
  '': 'neutro',
  ok: 'ok',
  warn: 'atencao',
  bad: 'falha',
}
</script>

<template>
  <BasePainel>
    <BaseCabecalhoSecao rotulo="panorama" titulo="Estado do loop" />
    <BaseGrade minimo="150px" espaco="5">
      <BaseKpi
        v-for="k in kpis"
        :key="k.l"
        :valor="k.v"
        :rotulo="k.l"
        :tom="TOM_POR_CHAVE[k.k]"
      />
    </BaseGrade>
  </BasePainel>
</template>
