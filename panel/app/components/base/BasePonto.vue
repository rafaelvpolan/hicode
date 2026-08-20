<script setup lang="ts">
import type { Tom } from '#shared/design'

interface BasePontoProps {
  tom?: Tom
  pulsando?: boolean
  tamanho?: number
}

const props = withDefaults(defineProps<BasePontoProps>(), {
  tom: 'neutro',
  pulsando: false,
  tamanho: 8,
})

const lado = computed<string>(() => `${props.tamanho}px`)
</script>

<template>
  <i class="ponto" :class="{ pulsando }" :data-tom="tom" aria-hidden="true" />
</template>

<style scoped>
.ponto {
  width: v-bind(lado);
  height: v-bind(lado);
  border-radius: var(--raio-pilula);
  background: var(--cor-tom);
  display: inline-block;
  flex: 0 0 auto;
}

@media (prefers-reduced-motion: no-preference) {
  .pulsando { animation: pulso 1.4s var(--curva) infinite; }
}

@keyframes pulso {
  0%, 100% { box-shadow: 0 0 0 0 var(--veu-tom); opacity: 1; }
  50% { box-shadow: 0 0 0 5px transparent; opacity: 0.55; }
}
</style>
