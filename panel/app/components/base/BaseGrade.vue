<script setup lang="ts">
import type { EspacoDoLayout } from '#shared/design'

interface BaseGradeProps {
  minimo?: string
  espaco?: EspacoDoLayout
}

const props = withDefaults(defineProps<BaseGradeProps>(), {
  minimo: '240px',
  espaco: '4',
})

const gap = computed<string>(() => `var(--esp-${props.espaco})`)
const colunas = computed<string>(() => `repeat(auto-fit, minmax(min(${props.minimo}, 100%), 1fr))`)
</script>

<template>
  <div class="grade">
    <slot />
  </div>
</template>

<style scoped>
.grade {
  display: grid;
  gap: v-bind(gap);
  grid-template-columns: v-bind(colunas);
}
</style>
