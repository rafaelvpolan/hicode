<script setup lang="ts">
import type { Tom } from '#shared/design'

interface BaseRotuloProps {
  texto: string
  tom?: Tom
}

withDefaults(defineProps<BaseRotuloProps>(), { tom: 'acento' })
</script>

<template>
  <span class="rotulo" :data-tom="tom">
    <i class="risco" aria-hidden="true" />{{ texto }}
  </span>
</template>

<style scoped>
.rotulo {
  display: inline-flex;
  align-items: center;
  gap: var(--esp-2);
  font-family: var(--fonte-mono);
  font-size: var(--tf-micro);
  font-weight: var(--peso-forte);
  letter-spacing: var(--tracking-rotulo);
  text-transform: uppercase;
  color: var(--cor-tom);
}

.risco {
  width: 18px;
  height: 1px;
  background: var(--cor-tom);
  display: inline-block;
}
</style>
