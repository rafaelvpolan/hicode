<script setup lang="ts">
import type { TamanhoDeKpi, Tom } from '#shared/design'

interface BaseKpiProps {
  valor: string
  rotulo: string
  tom?: Tom
  tamanho?: TamanhoDeKpi
  nota?: string
}

withDefaults(defineProps<BaseKpiProps>(), {
  tom: 'neutro',
  tamanho: 'md',
  nota: '',
})
</script>

<template>
  <div class="kpi" :class="tamanho" :data-tom="tom">
    <b class="valor">{{ valor }}</b>
    <span class="rotulo">{{ rotulo }}</span>
    <span v-if="nota" class="nota">{{ nota }}</span>
  </div>
</template>

<style scoped>
.kpi { display: flex; flex-direction: column; gap: var(--esp-1); min-width: 0; }

.valor {
  font-family: var(--fonte-display);
  font-size: var(--tf-xl);
  font-weight: var(--peso-display);
  line-height: var(--altura-display);
  letter-spacing: var(--tracking-display);
  color: var(--cor-tom);
  font-variant-numeric: tabular-nums;
}

.kpi[data-tom='neutro'] .valor { color: var(--texto); }

.kpi.lg .valor { font-size: var(--tf-display-g); }

.rotulo {
  font-family: var(--fonte-mono);
  font-size: var(--tf-micro);
  letter-spacing: var(--tracking-rotulo);
  text-transform: uppercase;
  color: var(--texto-mudo);
}

.nota { font-size: var(--tf-mini); color: var(--texto-fraco); }
</style>
