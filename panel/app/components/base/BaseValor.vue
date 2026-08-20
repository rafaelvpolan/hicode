<script setup lang="ts">
import type { Tom } from '#shared/design'

interface BaseValorProps {
  valor: string
  rotulo?: string
  tom?: Tom
  estimado?: boolean
  motivo?: string
}

withDefaults(defineProps<BaseValorProps>(), {
  rotulo: '',
  tom: 'neutro',
  estimado: false,
  motivo: '',
})
</script>

<template>
  <span class="celula" :class="{ estimado }" :data-tom="tom" :title="motivo || undefined">
    <b class="valor">{{ valor }}</b>
    <span v-if="rotulo" class="rotulo">{{ rotulo }}</span>
  </span>
</template>

<style scoped>
.celula { display: inline-flex; flex-direction: column; gap: 1px; min-width: 0; }

.valor {
  font-family: var(--fonte-mono);
  font-size: var(--tf-base);
  font-weight: var(--peso-forte);
  font-variant-numeric: tabular-nums;
  color: var(--cor-tom);
  line-height: 1.2;
}

.celula[data-tom='neutro'] .valor { color: var(--texto); }

.rotulo {
  font-family: var(--fonte-mono);
  font-size: var(--tf-micro);
  letter-spacing: var(--tracking-rotulo);
  text-transform: uppercase;
  color: var(--texto-mudo);
}

.celula.estimado .valor {
  color: var(--atencao);
  border-bottom: 1px dotted var(--atencao-borda);
  cursor: help;
}
</style>
