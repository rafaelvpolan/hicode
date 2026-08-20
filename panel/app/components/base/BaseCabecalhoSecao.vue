<script setup lang="ts">
import type { Tom } from '#shared/design'

interface BaseCabecalhoSecaoProps {
  titulo: string
  rotulo?: string
  descricao?: string
  tom?: Tom
}

withDefaults(defineProps<BaseCabecalhoSecaoProps>(), {
  rotulo: '',
  descricao: '',
  tom: 'acento',
})
</script>

<template>
  <header class="cab">
    <div class="txt">
      <BaseRotulo v-if="rotulo" :texto="rotulo" :tom="tom" />
      <h2 class="titulo">{{ titulo }}</h2>
      <p v-if="descricao" class="desc">{{ descricao }}</p>
    </div>
    <div v-if="$slots.acoes" class="acoes">
      <slot name="acoes" />
    </div>
  </header>
</template>

<style scoped>
.cab {
  display: flex;
  align-items: flex-end;
  gap: var(--esp-4);
  margin-bottom: var(--esp-4);
}

.txt { display: flex; flex-direction: column; gap: var(--esp-2); min-width: 0; }

.titulo {
  font-family: var(--fonte-display);
  font-size: var(--tf-xl);
  font-weight: var(--peso-display);
  letter-spacing: var(--tracking-display);
  line-height: var(--altura-display);
  text-transform: uppercase;
  color: var(--texto);
}

.desc { margin: 0; color: var(--texto-mudo); font-size: var(--tf-peq); }

.acoes { margin-left: auto; display: flex; gap: var(--esp-2); align-items: center; }
</style>
