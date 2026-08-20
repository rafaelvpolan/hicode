<script setup lang="ts">
import type { DirecaoDaPilha, EspacoDoLayout } from '#shared/design'

interface BasePilhaProps {
  espaco?: EspacoDoLayout
  direcao?: DirecaoDaPilha
  alinhamento?: 'inicio' | 'centro' | 'base' | 'esticar'
  quebrar?: boolean
}

const props = withDefaults(defineProps<BasePilhaProps>(), {
  espaco: '4',
  direcao: 'coluna',
  alinhamento: 'esticar',
  quebrar: false,
})

const ALINHAMENTOS: Record<NonNullable<BasePilhaProps['alinhamento']>, string> = {
  inicio: 'flex-start',
  centro: 'center',
  base: 'baseline',
  esticar: 'stretch',
}

const gap = computed<string>(() => `var(--esp-${props.espaco})`)
const flexDirection = computed<string>(() => (props.direcao === 'linha' ? 'row' : 'column'))
const alignItems = computed<string>(() => ALINHAMENTOS[props.alinhamento])
const flexWrap = computed<string>(() => (props.quebrar ? 'wrap' : 'nowrap'))
</script>

<template>
  <div class="pilha">
    <slot />
  </div>
</template>

<style scoped>
.pilha {
  display: flex;
  min-width: 0;
  gap: v-bind(gap);
  flex-direction: v-bind(flexDirection);
  align-items: v-bind(alignItems);
  flex-wrap: v-bind(flexWrap);
}
</style>
