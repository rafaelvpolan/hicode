<script setup lang="ts">
import type { Tom } from '#shared/design'

interface BaseChipProps {
  rotulo: string
  tom?: Tom
  ponto?: boolean
  pulsando?: boolean
  mono?: boolean
}

withDefaults(defineProps<BaseChipProps>(), {
  tom: 'neutro',
  ponto: false,
  pulsando: false,
  mono: false,
})
</script>

<template>
  <span class="chip" :class="{ mono }" :data-tom="tom">
    <BasePonto v-if="ponto" :tom="tom" :pulsando="pulsando" :tamanho="6" />
    {{ rotulo }}
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--esp-2);
  padding: 2px var(--esp-2);
  border: 1px solid var(--borda-tom);
  border-radius: var(--raio-pilula);
  background: var(--veu-tom);
  color: var(--cor-tom);
  font-size: var(--tf-mini);
  font-weight: var(--peso-forte);
  letter-spacing: var(--tracking-titulo);
  white-space: nowrap;
}

.chip.mono { font-family: var(--fonte-mono); }
</style>
